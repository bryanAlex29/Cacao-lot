import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/auth.decorators';
import { CreateUserDto, PublicUserDto } from './user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiCreatedResponse({
    type: PublicUserDto,
    description: 'Crea FARMER; nunca acepta un rol del cliente',
  })
  create(@Body() input: CreateUserDto): Promise<PublicUserDto> {
    return this.users.create(input);
  }
}
