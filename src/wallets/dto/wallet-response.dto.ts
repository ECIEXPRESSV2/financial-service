import { ApiProperty } from '@nestjs/swagger';
import { Wallet } from '../entities/wallet.entity';

/** Vista pública del saldo y estado de la billetera del comprador. */
export class WalletResponseDto {
  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  id: string;

  @ApiProperty({
    example: '3f1a...',
    description: 'Id del comprador (Identity).',
  })
  userId: string;

  @ApiProperty({
    example: 150000,
    description: 'Saldo disponible en centavos COP.',
  })
  balance: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromEntity(wallet: Wallet): WalletResponseDto {
    const dto = new WalletResponseDto();
    dto.id = wallet.id;
    dto.userId = wallet.userId;
    dto.balance = wallet.balance;
    dto.isActive = wallet.isActive;
    return dto;
  }
}
