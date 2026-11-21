import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class SanitizedExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body =
      error instanceof HttpException
        ? error.getResponse()
        : { statusCode: 500, message: 'No se pudo completar la operación' };
    // No registrar errores ORM sin filtrar: pueden incluir argumentos y hashes.
    this.adapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }
}
