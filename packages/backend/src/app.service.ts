import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
    };
  }

  getInfo() {
    return {
      name: 'HandyCall API',
      version: '0.1.0',
      description: 'Multi-tenant AI Receptionist Platform',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
