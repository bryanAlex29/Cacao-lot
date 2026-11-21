import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto, RegisterDto } from './auth.dto';

describe('Validación de registro público', () => {
  const base = { name: 'Agricultor', email: 'user@example.test', password: 'Abcdefg!' };

  it('normaliza correo y nombre sin modificar la contraseña', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...base,
      name: ' Agricultor ',
      email: ' USER@example.test ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('user@example.test');
    expect(dto.name).toBe('Agricultor');
    expect(dto.password).toBe(base.password);
  });

  it.each([
    { name: '' },
    { name: '   ' },
    { email: 'invalid' },
    { password: 'short' },
    { password: 'Abcdef!' },
    { password: 'abcdefg!' },
    { password: 'Abcdefgh' },
    { password: 'Abcdefg ' },
    { password: 'Abcdefg1' },
    { password: ' '.repeat(12) },
    { password: 'x'.repeat(129) },
    { password: null },
  ])('rechaza datos inválidos', async (invalid) => {
    expect(
      (await validate(plainToInstance(RegisterDto, { ...base, ...invalid }))).length,
    ).toBeGreaterThan(0);
  });

  it.each(['Abcdefg!', 'ABCDEFG!', 'Ñbcdefg!', `A${'a'.repeat(126)}!`])(
    'acepta longitud y composición solicitadas',
    async (password) => {
      expect(await validate(plainToInstance(RegisterDto, { ...base, password }))).toHaveLength(0);
    },
  );

  it('no aplica la nueva composición al login de cuentas existentes', async () => {
    expect(
      await validate(plainToInstance(LoginDto, { email: base.email, password: 'legacy' })),
    ).toHaveLength(0);
  });
});
