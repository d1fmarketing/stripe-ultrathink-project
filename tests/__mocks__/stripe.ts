declare const jest: any;

type Resource = 'charges' | 'paymentIntents' | 'customers';

type RequestLogEntry = {
  method: string;
  id?: string;
  params?: any;
  options?: any;
  apiKey: string;
};

const mockState: {
  charges: Map<string, any>;
  paymentIntents: Map<string, any>;
  customers: Map<string, any>;
  chargesList: any[];
  requestLog: RequestLogEntry[];
} = {
  charges: new Map(),
  paymentIntents: new Map(),
  customers: new Map(),
  chargesList: [],
  requestLog: [],
};

function normalizeArgs(params?: any, options?: any) {
  if (params && !options && typeof params === 'object' && 'stripeAccount' in params) {
    return { params: undefined, options: params };
  }
  return { params, options };
}

export function __setMockResponse(resource: Resource, id: string, data: any) {
  switch (resource) {
    case 'charges':
      mockState.charges.set(id, data);
      break;
    case 'paymentIntents':
      mockState.paymentIntents.set(id, data);
      break;
    case 'customers':
      mockState.customers.set(id, data);
      break;
  }
}

export function __setChargesList(data: any[]) {
  mockState.chargesList = data;
}

export function __resetMockState() {
  mockState.charges.clear();
  mockState.paymentIntents.clear();
  mockState.customers.clear();
  mockState.chargesList = [];
  mockState.requestLog = [];
}

export function __getRequestLog(): RequestLogEntry[] {
  return mockState.requestLog;
}

export default class StripeMock {
  private apiKey: string;

  charges: {
    retrieve: ReturnType<typeof jest.fn>;
    list: ReturnType<typeof jest.fn>;
  };

  paymentIntents: {
    retrieve: ReturnType<typeof jest.fn>;
  };

  customers: {
    retrieve: ReturnType<typeof jest.fn>;
  };

  constructor(apiKey: string, _config?: any) {
    this.apiKey = apiKey;

    this.charges = {
      retrieve: jest.fn(async (id: string, params?: any, options?: any) => {
        const normalized = normalizeArgs(params, options);
        mockState.requestLog.push({
          method: 'charges.retrieve',
          id,
          params: normalized.params,
          options: normalized.options,
          apiKey: this.apiKey,
        });
        return mockState.charges.get(id) ?? { id, object: 'charge' };
      }),
      list: jest.fn(async (params?: any, options?: any) => {
        const normalized = normalizeArgs(params, options);
        mockState.requestLog.push({
          method: 'charges.list',
          params: normalized.params,
          options: normalized.options,
          apiKey: this.apiKey,
        });
        return {
          object: 'list',
          data: mockState.chargesList,
          has_more: false,
        };
      }),
    };

    this.paymentIntents = {
      retrieve: jest.fn(async (id: string, params?: any, options?: any) => {
        const normalized = normalizeArgs(params, options);
        mockState.requestLog.push({
          method: 'paymentIntents.retrieve',
          id,
          params: normalized.params,
          options: normalized.options,
          apiKey: this.apiKey,
        });
        return mockState.paymentIntents.get(id) ?? { id, object: 'payment_intent' };
      }),
    };

    this.customers = {
      retrieve: jest.fn(async (id: string, params?: any, options?: any) => {
        const normalized = normalizeArgs(params, options);
        mockState.requestLog.push({
          method: 'customers.retrieve',
          id,
          params: normalized.params,
          options: normalized.options,
          apiKey: this.apiKey,
        });
        return mockState.customers.get(id) ?? { id, object: 'customer' };
      }),
    };
  }
}
