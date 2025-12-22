import FormData from 'form-data';
import fetch from 'node-fetch';
import { GraphQLFieldConfig } from 'graphql';
import nodePath from 'path';
import _ from 'lodash';
import { RiseDirectiveOptions, getReqHeaders, processResHeaders } from './common';

export function generateBodyFromTemplate(template, args) {
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
      const value = typeof body[key] === 'string' ? body[key] : JSON.stringify(body[key]);
      formData.append(key, value);
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

export interface RiseDirectiveOptionsRest extends RiseDirectiveOptions {
  apiType: 'rest';
  resultroot: string | undefined;
  errorroot: string | undefined;
}

export function restResolver(
  riseDirective,
  options: RiseDirectiveOptionsRest,
  fieldConfig: GraphQLFieldConfig<any, any, any>,
) {
  let {
    path,
    method = 'GET',
    setters = [],
    postbody,
    resultroot = options.resultroot,
    errorroot = options.errorroot,
    contenttype = options.contenttype || 'application/json',
  } = riseDirective;
  const url = nodePath.join(options.baseURL, path);

  fieldConfig.resolve = (source, args, context, info) => {
    let urlToFetch = url;
    let originalContext = context;
    let body: any;
    const reqHeaders = getReqHeaders(riseDirective, options, context);

    // eslint-disable-next-line no-underscore-dangle
    args = { ...args, ...source?.__args };

    Object.keys(args).forEach((arg) => {
      const argToReplace = `$${arg}`;
      if (!urlToFetch.includes(argToReplace)) return;

      let argToReplaceValue = '';
      try {
        // We only support path params and query params to be simple types
        if (typeof args[arg] !== 'object') {
          // Do not encode the value, cause path params are received encoded
          argToReplaceValue = args[arg];
        }
      } catch (e) {
        console.debug(`[Rise] Error encoding ${arg}, Message: ${(e as any)?.message || ''}`);
      }
      urlToFetch = urlToFetch.replace(argToReplace, argToReplaceValue);
    });

    if (method !== 'GET' && method !== 'HEAD') {
      body = postbody
        ? generateBodyFromTemplate(postbody, args)
        : autogenerateBody(args);
      body = formatForContentType(body, contenttype);
    }

    // eslint-disable-next-line no-underscore-dangle
    if (reqHeaders['Content-Type'] === 'multipart/form-data' && body._boundary) {
      // eslint-disable-next-line no-underscore-dangle
      reqHeaders['Content-Type'] = `multipart/form-data; boundary=${body._boundary}`;
    }

    // if user sends a text request, we will forward the exact to the server along with
    // the content type
    const originalHeaders = context.req?.orginalHeaders || {};
    const contentTypeHeaderKey = Object.keys(originalHeaders).filter((header) => header.toLowerCase() === 'content-type')[0];
    const contentTypeHeaderValue = contentTypeHeaderKey && originalHeaders[contentTypeHeaderKey];
    if (contentTypeHeaderValue?.includes('text/')) {
      reqHeaders['Content-Type'] = contentTypeHeaderValue;
      body = context.req?.body;
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
          let payload;
          try {
            const contentType = response.headers.get('Content-Type');
            const isTextContent = contentType && contentType.includes('text');
            if (isTextContent) {
              payload = { [errorroot]: { message: await response.text() } };
            } else {
              payload = await response.json();
            }
          } catch (e) {
            throw new options.ErrorClass(response.statusText, response.status, e);
          }
          const error = (errorroot ? _.get(payload, errorroot) : payload) || {};
          throw new options.ErrorClass(response.statusText, response.status, error);
        }
        processResHeaders(response, originalContext);
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
