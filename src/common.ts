import _ from 'lodash';

const FORWARD_RESPONSE_HEADERS = [
    'set-cookie',
    'x-callosum-incident-id',
    'x-callosum-ip',
    'x-callosum-request-time-us',
    'x-callosum-trace-id',
    'x-content-type-options',
    'x-nginx-localhost',
    'x-ua-compatible',
    'x-xss-protection',
    'x-csrf-token',
];

export const commonDefs = `
    scalar JSON
    input RiseSetter {
        field: String
        path: String!
    }
`;

export interface RiseDirectiveOptions {
    name: string;
    baseURL: string;
    apiType: 'rest' | 'gql';
    headers: Record<string, string>;
    forwardheaders: string[];
    contenttype: string | undefined;
    ErrorClass: new (...args: any[]) => Error;
}

export function getReqHeaders(riseDirective: RiseDirectiveOptions, options, context) {
    let {
        headers = {},
        contenttype = options.contenttype || 'application/json',
        forwardheaders = [],
      } = riseDirective;

      headers = {
        'Content-Type': contenttype,
        ...options.headers,
        ...headers,
      };
      forwardheaders.push(...options.forwardheaders);
      forwardheaders = forwardheaders.map((h) => h.toLowerCase());
      return {
        ...headers,
        ..._.pickBy(context.req.headers, (v, h) => forwardheaders.includes(h.toLowerCase())),
      };
}

export function processResHeaders(response, context) {
    // Setting the headers returned from response
    const responseHeaders: any = response.headers.raw();
    FORWARD_RESPONSE_HEADERS.forEach((key) => {
    if (responseHeaders[key]) {
        context.res.setHeader(key, responseHeaders[key]);
    }
    });
}

export class RestError extends Error {
    public code: number;

    public errors: any;

    constructor(message = 'Error occured', code = 400, errors = null) {
        super(message);
        this.code = code;
        this.errors = errors;
    }
}
