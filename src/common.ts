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

// The function is used to map the keys of the object to the new keys
// By default, it will return the original object if the key is not in the keyMap
// Example:
// const obj = { a: 1, b: 2, c: 3 }
// const keyMap = { a: 'd', b: 'e', f: 'g' }
// const newObj = mapKeysDeep(obj, keyMap)
// newObj will be { d: 1, e: 2, c: 3 }
// The function will not modify the original object
export function mapKeysDeep(obj: any, keyMap: Record<string, string> = {}): any {
    // If keyMap is empty, return original object
    if (!keyMap || Object.keys(keyMap).length === 0) {
        return obj;
    }
    // If obj is an array, map each item in the array
    if (Array.isArray(obj)) {
        return obj.map((item) => mapKeysDeep(item, keyMap));
    }
    // If obj is an object, map each key in the object
    if (obj !== null && typeof obj === 'object') {
        const mapped: Record<string, any> = {};
        Object.keys(obj).forEach((key) => {
            const newKey = keyMap[key] || key;
            mapped[newKey] = mapKeysDeep(obj[key], keyMap);
        });
        return mapped;
    }
    return obj;
}
