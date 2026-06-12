import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WalletsService } from './wallets.service';
import { WalletResponseDto } from './dto/wallet-response.dto';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar el saldo y estado de mi billetera (header x-user-id).',
  })
  @ApiOkResponse({ type: WalletResponseDto })
  async getMyWallet(@CurrentUser() userId: string): Promise<WalletResponseDto> {
    const wallet = await this.walletsService.findWalletByUserId(userId);
    return WalletResponseDto.fromEntity(wallet);
  }
}
