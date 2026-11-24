import copy
import math
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from train_regression import train_and_evaluate, validate_dataset, scores, private_path


def iso(value):
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def fixture():
    start = datetime(2026, 10, 1, tzinfo=timezone.utc)
    rows, diagnostics = [], []
    for zone, code in enumerate(("soil_1", "soil_2", "soil_3")):
        counts = {part: {"baselineEligible": 0, "excludedLag2": 0, "comparisonSamples": 0} for part in ("train", "validation", "test")}
        for index in range(14):
            day = start + timedelta(days=index)
            part = "train" if index < 8 else "validation" if index < 11 else "test"
            first = 20 + (index % 5) * 3 + zone * 2 if part == "train" else 70 + index
            second = 10 + ((index * index) % 7) * 2
            rows.append({"code": code, "sensorId": f"synthetic-{code}", "partition": part,
                         "issuedAt": iso(day), "targetDay": day.date().isoformat(),
                         "features": {"lastMoisturePct": first, "lag2MoisturePct": second},
                         "featureEvidence": {"eventId": f"lag1-{index}", "observedAt": iso(day - timedelta(hours=12)), "availableAt": iso(day - timedelta(hours=12) + timedelta(seconds=1))},
                         "lag2Evidence": {"eventId": f"lag2-{index}", "observedAt": iso(day - timedelta(hours=36)), "availableAt": iso(day - timedelta(hours=36) + timedelta(seconds=1))},
                         "target": {"moisturePct": 5 + 0.5 * first + 0.25 * second, "eventId": f"target-{index}", "observedAt": iso(day + timedelta(hours=12)), "availableAt": iso(day + timedelta(hours=12, seconds=1))}})
            counts[part]["baselineEligible"] += 1
            counts[part]["comparisonSamples"] += 1
        diagnostics.append({"code": code, **counts})
    return {"schemaVersion": "soil-two-lag-asof-v1", "inputHash": "a" * 64,
            "identity": {"plotId": "synthetic-plot", "deviceId": "synthetic-device", "source": "demo"},
            "asOf": "2026-10-15T00:00:00.000Z", "period": {"from": "2026-10-01", "toExclusive": "2026-10-15", "timezone": "UTC"},
            "split": {"trainUntil": "2026-10-09", "validationUntil": "2026-10-12"},
            "featureSchema": [{"name": "lastMoisturePct", "unit": "%", "policy": "latest_previous_utc_day_received_by_issue"},
                              {"name": "lag2MoisturePct", "unit": "%", "policy": "latest_two_utc_days_before_received_by_issue"}],
            "target": {"variable": "soil_moisture", "unit": "%", "horizonDays": 1, "policy": "latest_target_utc_day_received_by_partition_cutoff"},
            "samples": rows, "diagnostics": diagnostics}


class RegressionTest(unittest.TestCase):
    def evaluate(self, data):
        return train_and_evaluate(data, "b" * 64)

    def test_known_linear_relationship_and_common_heldout_rows(self):
        report = self.evaluate(fixture())
        self.assertFalse(report["fieldValidated"])
        self.assertIsNone(report["preferredModel"])
        for zone in report["zones"]:
            self.assertEqual(zone["status"], "fitted_experimental")
            self.assertEqual(zone["artifact"]["trainSamples"], 8)
            for part in ("validation", "test"):
                self.assertEqual(zone[part]["comparisonBasis"], "identical_rows")
                self.assertEqual(zone[part]["persistence"]["samples"], zone[part]["regression"]["samples"])
                self.assertLess(zone[part]["regression"]["maePp"], 1e-10)
                self.assertLess(zone[part]["maeDifferencePp"], 0)

    def test_scaler_fit_only_training_and_coefficients_reconstruct_predictions(self):
        data = fixture()
        report = self.evaluate(data)
        artifact = report["zones"][0]["artifact"]
        train = [row for row in data["samples"] if row["code"] == "soil_1" and row["partition"] == "train"]
        mean = np.mean([[row["features"][name] for name in artifact["featureNames"]] for row in train], axis=0)
        np.testing.assert_allclose(artifact["scalerMean"], mean)
        held_out = next(row for row in data["samples"] if row["code"] == "soil_1" and row["partition"] == "test")
        value = artifact["interceptScaled"] + sum((held_out["features"][name] - artifact["scalerMean"][index]) / artifact["scalerScale"][index] * artifact["coefficientsScaled"][index] for index, name in enumerate(artifact["featureNames"]))
        self.assertAlmostEqual(value, report["zones"][0]["test"]["rows"][0]["regression"])

    def test_heldout_labels_and_features_cannot_change_training(self):
        data = fixture()
        original = self.evaluate(data)
        for row in data["samples"]:
            if row["partition"] != "train":
                row["target"]["moisturePct"] = 99
                row["features"] = {"lastMoisturePct": 0, "lag2MoisturePct": 100}
        modified = self.evaluate(data)
        self.assertEqual([zone["artifact"] for zone in original["zones"]], [zone["artifact"] for zone in modified["zones"]])
        self.assertNotEqual(original["zones"][0]["test"]["regression"]["maePp"], modified["zones"][0]["test"]["regression"]["maePp"])

    def test_no_input_mutation_and_stable_order(self):
        data = fixture()
        before = copy.deepcopy(data)
        report = self.evaluate(data)
        self.assertEqual(data, before)
        data["samples"].reverse()
        self.assertEqual(report, self.evaluate(data))

    def test_rank_deficiency_not_hidden_as_success(self):
        data = fixture()
        for row in data["samples"]:
            if row["partition"] == "train":
                row["features"] = {"lastMoisturePct": 10, "lag2MoisturePct": 10}
        report = self.evaluate(data)
        for zone in report["zones"]:
            self.assertEqual(zone["reason"], "rank_deficient")
            self.assertIsNone(zone["artifact"])
            self.assertIsNone(zone["test"]["regression"])
            self.assertEqual(zone["test"]["persistence"]["status"], "evaluated")

    def test_too_few_training_samples(self):
        data = fixture()
        data["samples"] = [row for row in data["samples"] if row["partition"] != "train" or row["targetDay"] >= "2026-10-07"]
        for zone in data["diagnostics"]:
            zone["train"] = {"baselineEligible": 2, "excludedLag2": 0, "comparisonSamples": 2}
        self.assertTrue(all(zone["reason"] == "insufficient_training_samples" for zone in self.evaluate(data)["zones"]))

    def test_empty_data_has_null_metrics_not_zero_error(self):
        data = fixture()
        data["samples"] = []
        for zone in data["diagnostics"]:
            for part in ("train", "validation", "test"):
                zone[part] = {"baselineEligible": 0, "excludedLag2": 0, "comparisonSamples": 0}
        report = self.evaluate(data)
        self.assertIsNone(report["zones"][0]["test"]["persistence"]["maePp"])
        self.assertIsNone(report["zones"][0]["test"]["regression"])

    def test_unclipped_out_of_range_predictions_are_counted(self):
        data = fixture()
        for row in data["samples"]:
            if row["code"] != "soil_1":
                continue
            if row["partition"] == "train":
                features = row["features"]
                row["target"]["moisturePct"] = 3 * features["lastMoisturePct"] - 2 * features["lag2MoisturePct"] + 10
            else:
                row["features"] = {"lastMoisturePct": 100, "lag2MoisturePct": 0}
        report = self.evaluate(data)
        self.assertEqual(report["clipping"], "none")
        self.assertGreater(report["zones"][0]["test"]["rows"][0]["regression"], 100)
        self.assertEqual(report["zones"][0]["test"]["regression"]["outOfRangePredictions"], 3)

    def test_future_features_and_late_training_labels_are_rejected(self):
        for field in ("featureEvidence", "lag2Evidence", "target"):
            data = fixture()
            data["samples"][0][field]["availableAt"] = "2026-10-10T00:00:00.000Z"
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_dataset(data)

    def test_partition_and_duplicate_identity_guards(self):
        data = fixture()
        data["samples"][0]["partition"] = "test"
        with self.assertRaises(ValueError):
            validate_dataset(data)
        data = fixture()
        data["samples"].append(copy.deepcopy(data["samples"][0]))
        with self.assertRaises(ValueError):
            validate_dataset(data)
        data = fixture()
        data["samples"][0]["sensorId"] = "synthetic-soil_2"
        with self.assertRaises(ValueError):
            validate_dataset(data)

    def test_strict_values_schema_and_diagnostic_counts(self):
        for value in (None, True, "30", math.nan, 101):
            data = fixture()
            data["samples"][0]["features"]["lastMoisturePct"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_dataset(data)
        data = fixture()
        data["diagnostics"][0]["train"]["comparisonSamples"] += 1
        with self.assertRaises(ValueError):
            validate_dataset(data)
        data = fixture()
        data["featureSchema"][0]["unit"] = "L"
        with self.assertRaises(ValueError):
            validate_dataset(data)

    def test_metrics_match_manual_calculation_and_private_paths(self):
        result = scores(np.array([2.0, 0.0]), np.array([0.0, 4.0]))
        self.assertEqual(result["maePp"], 3)
        self.assertAlmostEqual(result["rmsePp"], math.sqrt(10))
        self.assertEqual(result["biasPp"], 1)
        with self.assertRaises(ValueError):
            private_path(Path(__file__).resolve().parents[2] / "README.md")


if __name__ == "__main__":
    unittest.main()
