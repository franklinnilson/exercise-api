import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './global-api-key.guard';

interface SupabaseJwtPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  email?: string;
  role?: string;
  user_metadata?: {
    name?: string;
    user_type?: string;
  };
}

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // 1. Validar API Key
    const apiKey = request.headers['x-api-key'];
    const validApiKey = this.configService.get<string>('API_KEY');

    if (!validApiKey) {
      throw new UnauthorizedException('API Key não configurada no servidor');
    }

    if (!apiKey) {
      throw new UnauthorizedException('Header x-api-key é obrigatório');
    }

    if (!this.secureCompare(apiKey, validApiKey)) {
      throw new UnauthorizedException('API Key inválida');
    }

    // 2. Validar JWT Token do Supabase
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Header Authorization Bearer é obrigatório');
    }

    const token = authHeader.substring(7);
    
    try {
      const payload = await this.jwtService.verifyAsync<SupabaseJwtPayload>(token, {
        secret: this.configService.get<string>('SUPABASE_JWT_SECRET'),
      });

      const allowedIssuers = this.configService.get<string>('SUPABASE_URL');
      if (allowedIssuers && !payload.iss.startsWith(allowedIssuers)) {
        throw new UnauthorizedException('Token de origem não autorizada');
      }

      if (payload.aud !== 'authenticated' || payload.role !== 'authenticated') {
        throw new UnauthorizedException('Usuário não autenticado');
      }

      if (payload.exp && payload.exp * 1000 < Date.now()) {
        throw new UnauthorizedException('Token expirado');
      }

      request.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.user_metadata?.name,
        userType: payload.user_metadata?.user_type,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token JWT inválido ou expirado');
    }
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
