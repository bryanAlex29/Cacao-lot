"""Offline experimental comparison only. No database, HTTP, pickle or valve commands."""

import argparse
import hashlib
import json
import math
import os
import platform
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import scipy
import sklearn
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits


CODES = ("soil_1", "soil_2", "soil_3")
FEATURES = ("lastMoisturePct", "lag2MoisturePct")
PARTITIONS = ("train", "validation", "test")
VERSION = "linear-two-lag-1.0.0"
MIN_TRAIN_SAMPLES = 4  # two features + intercept + residual DOF; NOT agronomic sufficiency


def require(condition, message="Dataset de regresión incompatible"):
    if not condition:
        raise ValueError(message)


def exact(value, keys):
    require(isinstance(value, dict) and set(value) == set(keys))


def text(value):
    require(isinstance(value, str) and bool(value.strip()) and len(value) <= 120)


def instant(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", value) is not None)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def day(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is not None)
    return instant(value + "T00:00:00.000Z")


def moisture(value):
    require(type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 100)


def evidence(value, issued, lag):
    exact(value, ("eventId", "observedAt", "availableAt"))
    text(value["eventId"])
    observed = instant(value["observedAt"])
    require(issued - timedelta(days=lag) <= observed < issued - timedelta(days=lag - 1))
    require(instant(value["availableAt"]) <= issued, "Feature recibida después de emitir")


def validate_dataset(data):
    exact(data, ("schemaVersion", "inputHash", "identity", "asOf", "period", "split", "featureSchema", "target", "samples", "diagnostics"))
    require(data["schemaVersion"] == "soil-two-lag-asof-v1")
    require(isinstance(data["inputHash"], str) and re.fullmatch(r"[a-f0-9]{64}", data["inputHash"]) is not None)
    exact(data["identity"], ("plotId", "deviceId", "source"))
    text(data["identity"]["plotId"])
    text(data["identity"]["deviceId"])
    require(data["identity"]["source"] in ("real", "demo"))
    exact(data["period"], ("from", "toExclusive", "timezone"))
    exact(data["split"], ("trainUntil", "validationUntil"))
    start, end = day(data["period"]["from"]), day(data["period"]["toExclusive"])
    train_end, validation_end = day(data["split"]["trainUntil"]), day(data["split"]["validationUntil"])
    as_of = instant(data["asOf"])
    require(data["period"]["timezone"] == "UTC" and start < train_end < validation_end < end)
    require(end <= as_of.replace(hour=0, minute=0, second=0, microsecond=0) and end - start <= timedelta(days=366))
    require(data["featureSchema"] == [
        {"name": FEATURES[0], "unit": "%", "policy": "latest_previous_utc_day_received_by_issue"},
        {"name": FEATURES[1], "unit": "%", "policy": "latest_two_utc_days_before_received_by_issue"},
    ])
    require(data["target"] == {"variable": "soil_moisture", "unit": "%", "horizonDays": 1, "policy": "latest_target_utc_day_received_by_partition_cutoff"})
    require(isinstance(data["samples"], list) and len(data["samples"]) <= 3 * 366)
    seen, sensors, sensor_codes = set(), {}, {}
    counts = {(code, part): 0 for code in CODES for part in PARTITIONS}
    for row in data["samples"]:
        exact(row, ("code", "sensorId", "partition", "issuedAt", "targetDay", "features", "featureEvidence", "target", "lag2Evidence"))
        code, partition = row["code"], row["partition"]
        require(code in CODES and partition in PARTITIONS)
        text(row["sensorId"])
        require(code not in sensors or sensors[code] == row["sensorId"])
        require(row["sensorId"] not in sensor_codes or sensor_codes[row["sensorId"]] == code)
        sensors[code], sensor_codes[row["sensorId"]] = row["sensorId"], code
        issued = instant(row["issuedAt"])
        require(issued == day(row["targetDay"]) and start <= issued < end)
        expected = "train" if issued < train_end else "validation" if issued < validation_end else "test"
        require(partition == expected, "Partición incompatible con las fechas")
        require((code, row["targetDay"]) not in seen, "Día/sonda duplicado")
        seen.add((code, row["targetDay"]))
        exact(row["features"], FEATURES)
        for value in row["features"].values():
            moisture(value)
        evidence(row["featureEvidence"], issued, 1)
        evidence(row["lag2Evidence"], issued, 2)
        target = row["target"]
        exact(target, ("moisturePct", "eventId", "observedAt", "availableAt"))
        moisture(target["moisturePct"])
        text(target["eventId"])
        require(issued <= instant(target["observedAt"]) < issued + timedelta(days=1))
        cutoff = train_end if partition == "train" else validation_end if partition == "validation" else as_of
        require(instant(target["availableAt"]) <= cutoff, "Etiqueta posterior al corte de su partición")
        counts[(code, partition)] += 1
    require(isinstance(data["diagnostics"], list) and len(data["diagnostics"]) == 3)
    require([item.get("code") for item in data["diagnostics"]] == list(CODES))
    for zone in data["diagnostics"]:
        exact(zone, ("code", *PARTITIONS))
        for part in PARTITIONS:
            count = zone[part]
            exact(count, ("baselineEligible", "excludedLag2", "comparisonSamples"))
            require(all(type(value) is int and value >= 0 for value in count.values()))
            require(count["comparisonSamples"] == counts[(zone["code"], part)])
            require(count["baselineEligible"] == count["comparisonSamples"] + count["excludedLag2"])
    return sorted(data["samples"], key=lambda row: (CODES.index(row["code"]), row["targetDay"]))


def scores(observed, predicted):
    if not len(observed):
        return {"status": "no_evaluable_samples", "samples": 0, "maePp": None, "rmsePp": None, "biasPp": None, "outOfRangePredictions": 0}
    require(np.isfinite(predicted).all(), "Salida numérica no finita")
    return {"status": "evaluated", "samples": len(observed),
            "maePp": float(mean_absolute_error(observed, predicted)),
            "rmsePp": float(root_mean_squared_error(observed, predicted)),
            "biasPp": float(np.mean(predicted - observed)),
            "outOfRangePredictions": int(np.sum((predicted < 0) | (predicted > 100)))}


def train_and_evaluate(data, dataset_hash):
    rows = validate_dataset(data)
    require(isinstance(dataset_hash, str) and re.fullmatch(r"[a-f0-9]{64}", dataset_hash) is not None)
    zones = []
    for code in CODES:
        own = [row for row in rows if row["code"] == code]
        training = [row for row in own if row["partition"] == "train"]
        model, artifact, reason = None, None, "insufficient_training_samples"
        if len(training) >= MIN_TRAIN_SAMPLES:
            x = np.array([[row["features"][name] for name in FEATURES] for row in training], dtype=float)
            y = np.array([row["target"]["moisturePct"] for row in training], dtype=float)
            candidate = Pipeline([("scale", StandardScaler()), ("regression", LinearRegression())])
            with threadpool_limits(limits=1):
                candidate.fit(x, y)
            scale, regression = candidate.named_steps["scale"], candidate.named_steps["regression"]
            reason = "rank_deficient"
            if regression.rank_ == len(FEATURES):
                require(np.isfinite(regression.coef_).all() and math.isfinite(float(regression.intercept_)))
                model, reason = candidate, None
                artifact = {"version": VERSION, "sensorId": training[0]["sensorId"], "trainSamples": len(training),
                            "trainedUntilExclusive": data["split"]["trainUntil"],
                            "firstTrainingTargetDay": training[0]["targetDay"], "lastTrainingTargetDay": training[-1]["targetDay"],
                            "featureNames": list(FEATURES), "scalerMean": scale.mean_.tolist(), "scalerScale": scale.scale_.tolist(),
                            "coefficientsScaled": regression.coef_.tolist(), "interceptScaled": float(regression.intercept_), "rank": int(regression.rank_)}
        evaluation = {}
        for partition in ("validation", "test"):
            held_out = [row for row in own if row["partition"] == partition]
            y = np.array([row["target"]["moisturePct"] for row in held_out], dtype=float)
            persistence = np.array([row["features"]["lastMoisturePct"] for row in held_out], dtype=float)
            predictions = None
            if model is not None:
                if held_out:
                    with threadpool_limits(limits=1):
                        predictions = model.predict(np.array([[row["features"][name] for name in FEATURES] for row in held_out], dtype=float))
                else:
                    predictions = np.array([], dtype=float)
            baseline_score = scores(y, persistence)
            regression_score = scores(y, predictions) if predictions is not None else None
            evaluation[partition] = {"comparisonBasis": "identical_rows", "samples": len(held_out),
                "persistence": baseline_score, "regression": regression_score,
                "maeDifferencePp": regression_score["maePp"] - baseline_score["maePp"] if held_out and regression_score is not None else None,
                "rows": [{"targetDay": row["targetDay"], "observed": float(y[index]), "persistence": float(persistence[index]),
                          "regression": float(predictions[index]) if predictions is not None else None} for index, row in enumerate(held_out)]}
        zones.append({"code": code, "status": "fitted_experimental" if model is not None else "not_trained", "reason": reason,
                      "artifact": artifact, "validation": evaluation["validation"], "test": evaluation["test"]})
    return {"schemaVersion": "linear-comparison-v1", "status": "experimental", "fieldValidated": False,
            "datasetHash": dataset_hash, "inputHash": data["inputHash"], "identity": data["identity"], "asOf": data["asOf"],
            "target": data["target"], "split": data["split"], "diagnostics": data["diagnostics"],
            "model": {"name": "StandardScaler+LinearRegression", "version": VERSION, "fitPartition": "train", "minTrainingSamples": MIN_TRAIN_SAMPLES},
            "runtime": {"python": platform.python_version(), "scikitLearn": sklearn.__version__, "numpy": np.__version__, "scipy": scipy.__version__},
            "preferredModel": None, "uncertainty": "not_calibrated", "calibration": "not_verified", "clipping": "none",
            "limitations": ["Resultados retrospectivos experimentales, no pronósticos web.", "DEMO no acredita fiabilidad del cultivo.",
                             "Solo dos retardos de humedad; sin clima ni balance hídrico.", "Predicciones fuera de 0–100 se cuentan, no se ocultan recortándolas.",
                             "No calcula litros ni fecha de riego, no controla la válvula y no selecciona modelos con el test."], "zones": zones}


def private_path(path):
    root = Path(__file__).resolve().parents[2]
    private = (root / ".local").resolve()
    require(private.is_relative_to(root) and private != root)
    target = Path(path).resolve()
    require(target.is_relative_to(private) and target != private, "Ruta de experimento no privada")
    return target


def main():
    require(os.environ.get("NODE_ENV") != "production", "Evaluación experimental fuera de producción únicamente")
    parser = argparse.ArgumentParser(description="Evaluación offline experimental de dos retardos")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    source, destination = private_path(args.dataset), private_path(args.report)
    require(source.parent == destination.parent and source != destination)
    require(source.stat().st_size <= 16 * 1024 * 1024, "Dataset mayor de 16 MB")
    raw = source.read_bytes()
    data = json.loads(raw, parse_constant=lambda _value: require(False, "JSON no finito"))
    report = train_and_evaluate(data, hashlib.sha256(raw).hexdigest())
    with destination.open("x", encoding="utf-8") as file:
        file.write(json.dumps(report, ensure_ascii=False, allow_nan=False, indent=2) + "\n")
    destination.chmod(0o600)
    print("Comparación offline experimental guardada; sin selección automática ni validación de campo.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError):
        print("Evaluación rechazada o fallida; comprueba contrato, cortes y rutas privadas. No se declara un resultado válido.", file=sys.stderr)
        sys.exit(1)
