import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { CreateUserDto, normalizeEmail, PublicUserDto } from '../users/user.dto';

export class RegisterDto extends CreateUserDto {}

export class LoginDto {
  @ApiProperty({ format: 'email' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ writeOnly: true, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;
  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';
  @ApiProperty({ example: 900 })
  expiresIn!: number;
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;
}
