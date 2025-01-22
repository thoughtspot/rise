/* eslint-disable no-underscore-dangle */
import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import _ from 'lodash';
import { RiseDirectiveOptionsRest, restResolver } from './rest-resolver';
import { RiseDirectiveOptionsGql, gqlResolver } from './gql-resolver';
import { RestError } from './common';

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

export const getGqlRiseDirectiveTypeDefs = (name: string) => `
  input RiseGQLArgWrapper {
    name: String!
    type: String!
  }
  directive @${name}(argwrapper: RiseGQLArgWrapper) on FIELD_DEFINITION
`;

type RiseDirectiveOptions = RiseDirectiveOptionsRest | RiseDirectiveOptionsGql;

export function rise(
  opts: Partial<RiseDirectiveOptions> = {},
) {
  const options: RiseDirectiveOptions = {
    name: 'rise', apiType: 'rest', baseURL: '', contenttype: '', headers: {}, forwardheaders: [], resultroot: undefined, errorroot: undefined, ErrorClass: RestError, ...opts,
  };
  return {
    riseDirectiveTypeDefs: options.apiType === 'gql' ? getGqlRiseDirectiveTypeDefs(options.name) : getRiseDirectiveTypeDefs(options.name),
    riseDirectiveTransformer: (schema) => mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
        const riseDirective = getDirective(schema, fieldConfig, options.name)?.[0];
        if (riseDirective) {
          if (options.apiType === 'gql') {
            gqlResolver(riseDirective, options, fieldConfig);
          } else {
            restResolver(riseDirective, options, fieldConfig);
          }
        }

        return fieldConfig;
      },
    }),
  };
}
