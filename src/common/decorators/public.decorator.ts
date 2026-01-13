import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/global-api-key.guard';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
