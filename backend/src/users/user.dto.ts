import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
export const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    writeOnly: true,
    description: 'Al menos una mayúscula y un símbolo; los espacios no cuentan como símbolo.',
  })
  @IsString()
  @Length(8, 128, { message: 'La contraseña debe tener entre 8 y 128 caracteres' })
  @Matches(/\p{Lu}/u, { message: 'La contraseña debe incluir al menos una mayúscula' })
  @Matches(/[\p{P}\p{S}]/u, { message: 'La contraseña debe incluir al menos un símbolo' })
  password!: string;
}

export class PublicUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ format: 'email' })
  email!: string;
  @ApiProperty({ enum: UserRole })
  role!: UserRole;
}
