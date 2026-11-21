import { Injectable } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  async create(input: CreateUserDto) {
    return this.users.createFarmer({
      name: input.name,
      email: input.email,
      passwordHash: await this.passwords.hash(input.password),
    });
  }
}
