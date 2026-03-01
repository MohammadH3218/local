import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@handycall/shared';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  // @ts-expect-error RxJS version conflict between root and package node_modules
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    // @ts-expect-error RxJS version conflict
    return next.handle().pipe(
      // @ts-expect-error RxJS version conflict
      map((data) => ({
        success: true,
        data,
        meta: {
          timestamp: Date.now(),
        },
      }))
    );
  }
}
