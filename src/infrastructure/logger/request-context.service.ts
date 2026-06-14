import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  path?: string;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, fn: () => T): T {
    return this.als.run(context, fn);
  }

  get(): RequestContext | undefined {
    return this.als.getStore();
  }

  setUser(tenantId: string, userId: string): void {
    const store = this.als.getStore();
    if (store) {
      store.tenantId = tenantId;
      store.userId = userId;
    }
  }
}
