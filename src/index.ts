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
  return _.template(template)(args);
}

function autogenerateBody(args) {
  return _.pick(args, Object.getOwnPropertyNames(args));
}

function formatForContentType(body, contenttype) {
  if (contenttype === 'application/json') {
    return JSON.stringify(body);
  }

  if (contenttype === 'application/x-www-form-urlencoded') {
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

function transformWithSetters(
  data: any,
  setters: { field: string; path: string }[],
) {
  const result = { ...data };
  setters.forEach((setter) => {
    _.set(result, setter.field, _.get(data, setter.path));
  });
  return result;
}

export const getRiseDirectiveTypeDefs = (name: string) => `
  scalar JSON
  input RiseSetter {
    field: String!
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

          fieldConfig.resolve = (source, args, context, info) => {
            let urlToFetch = url;
            let body: any;
            Object.assign(headers, _.pick(context.req.headers, forwardheaders));

            if (args) {
              Object.keys(args).forEach((arg) => {
                urlToFetch = urlToFetch.replace(`$${arg}`, args[arg]);
              });
            }

            if (method !== 'GET' && method !== 'HEAD') {
              body = postbody
                ? generateBodyFromTemplate(postbody, args)
                : autogenerateBody(args);
              body = formatForContentType(body, contenttype);
            }

            return fetch(urlToFetch, {
              method,
              headers: { ...options.headers, ...headers },
              body,
            })
              .then(async (response) => {
                if (!response.ok) {
                  try {
                    const payload = await response.json();
                    const error = (errorroot ? _.get(payload, errorroot) : payload) || {};
                    throw new options.ErrorClass(response.statusText, response.status, error);
                  } catch (e) {
                    throw new options.ErrorClass(response.statusText, response.status);
                  }
                }

                return response.json();
              })
              .then((data: any) => {
                if (resultroot) {
                  data = _.get(data, resultroot); // TODO: support items[].field
                }
                if (setters) {
                  return transformWithSetters(data, setters);
                }

                return data;
              });
          };
        }

        return fieldConfig;
      },
    }),
};
}
