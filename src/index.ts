/* eslint-disable no-underscore-dangle */
import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import fetch from 'node-fetch';
import _ from 'lodash';
import FormData from 'form-data';
import nodePath from 'path';

class RestError extends Error {
  public code: number;

  constructor(message = 'Error occured', code = 400) {
    super(message);
    this.code = code;
  }
}

function generateBodyFromTemplate(template, args) {
  const body = _.template(template)({ args });
  return JSON.parse(body);
}

function autogenerateBody(args) {
  return _.pick(args, Object.getOwnPropertyNames(args));
}

function formatForContentType(body, contenttype) {
  if (contenttype === 'application/json') {
    return JSON.stringify(body);
  }

  if (contenttype === 'application/x-www-form-urlencoded') {
    body = _.mapValues(body, (v) => ((typeof v === 'object') ? JSON.stringify(v) : v));
    return new URLSearchParams(body).toString();
  }

  if (contenttype === 'multipart/form-data') {
    const formData = new FormData();
    Object.keys(body).forEach((key) => {
      formData.append(key, body[key]);
    });
    return formData;
  }

  return body;
}

function setOrAssign(target, setter, data) {
  if (setter.field) {
    _.set(target, setter.field, _.get(data, setter.path));
  } else {
    _.assign(target, _.get(data, setter.path));
  }
}

function transformWithSetters(
  data: any,
  setters: { field: string; path: string }[],
) {
  let result = data;
  if (!Array.isArray(data)) {
    result = { ...result };
    setters.forEach((setter) => {
      setOrAssign(result, setter, data);
    });
  } else {
    result = data.map((item) => {
      const newItem = { ...item };
      setters.forEach((setter) => {
        setOrAssign(newItem, setter, data);
      });
      return newItem;
    });
  }
  return result;
}

export const getRiseDirectiveTypeDefs = (name: string) => `
  scalar JSON
  input RiseSetter {
    field: String
    path: String!
  }
  directive @${name}(path: String!, method: String, headers: JSON, 
    setters: [RiseSetter], resultroot: String, postbody: String,
    forwardheaders: [String], contenttype: String) on FIELD_DEFINITION
`;

interface RiseDirectiveOptions {
  name: string;
  baseURL: string;
  headers: Record<string, string>;
  forwardheaders: string[];
  resultroot: string | undefined;
  errorroot: string | undefined;
  contenttype: string | undefined;
  ErrorClass: new (...args: any[]) => Error;
}

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

export function rise(
  opts: Partial<RiseDirectiveOptions> = {},
) {
  const options: RiseDirectiveOptions = {
    name: 'rise', baseURL: '', contenttype: '', headers: {}, forwardheaders: [], resultroot: undefined, errorroot: undefined, ErrorClass: RestError, ...opts,
  };
  return {
    riseDirectiveTypeDefs: getRiseDirectiveTypeDefs(options.name),
    riseDirectiveTransformer: (schema) => mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
        const riseDirective = getDirective(schema, fieldConfig, options.name)?.[0];
        if (riseDirective) {
          let {
            path,
            method = 'GET',
            headers = {},
            setters = [],
            postbody,
            resultroot = options.resultroot,
            errorroot = options.errorroot,
            contenttype = options.contenttype || 'application/json',
            forwardheaders = [],
          } = riseDirective;

          headers = {
            'Content-Type': contenttype,
            ...options.headers,
            ...headers,
          };
          const url = nodePath.join(options.baseURL, path);
          forwardheaders.push(...options.forwardheaders);
          forwardheaders = forwardheaders.map((h) => h.toLowerCase());

          fieldConfig.resolve = (source, args, context, info) => {
            let urlToFetch = url;
            let originalContext = context;
            let body: any;
            const reqHeaders = {
              ...headers,
              ..._.pickBy(context.req.headers, (v, h) => forwardheaders.includes(h.toLowerCase())),
            };

            args = { ...args, ...source?.__args };

            Object.keys(args).forEach((arg) => {
              if (typeof args[arg] !== 'object') {
                urlToFetch = urlToFetch.replace(`$${arg}`, args[arg]);
              }
            });

            if (method !== 'GET' && method !== 'HEAD') {
              body = postbody
                ? generateBodyFromTemplate(postbody, args)
                : autogenerateBody(args);
              body = formatForContentType(body, contenttype);
            }

            console.debug('[Rise] Downstream URL', urlToFetch);
            return fetch(urlToFetch, {
              method,
              headers: reqHeaders,
              body,
              credentials: 'include',
            })
              .then(async (response) => {
                if (!response.ok) {
                  try {
                    const payload = await response.json();
                    const error = (errorroot ? _.get(payload, errorroot) : payload) || {};
                    throw new options.ErrorClass(response.statusText, response.status, error);
                  } catch (e) {
                    throw new options.ErrorClass(response.statusText, response.status, e);
                  }
                }
                // Setting the headers returned from response
                const responseHeaders: any = response.headers.raw();
                FORWARD_RESPONSE_HEADERS.forEach((key) => {
                    if (responseHeaders[key]) {
                      originalContext.res.setHeader(key, responseHeaders[key]);
                    }
                });
                return (fieldConfig.type.toString() === 'Void')
                  ? response.text() : response.json();
              })
              .then((data: any) => {
                let result;
                if (!data || typeof data === 'string') {
                  result = data;
                }

                if (resultroot) {
                  if (Array.isArray(resultroot)) {
                    data = resultroot
                      .reduce((res, root) => Object.assign(res, _.get(data, root)), {});
                  } else {
                    data = _.get(data, resultroot); // TODO: support items[].field
                  }
                }

                result = data;
                if (setters.length > 0) {
                  result = transformWithSetters(data, setters);
                }

                // Put arguments in the result for any nested rise calls
                // to use.
                if (result) {
                  // eslint-disable-next-line no-underscore-dangle
                  result.__args = args;
                }
                return result;
              });
          };
        }

        return fieldConfig;
      },
    }),
  };
}
