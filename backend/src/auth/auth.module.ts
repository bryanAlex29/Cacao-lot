import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { UsersController } from '../users/users.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  controllers: [AuthController, UsersController],
  providers: [UsersRepository, UsersService, AuthService, PasswordService],
  exports: [AuthService],
})
export class AuthModule {}
