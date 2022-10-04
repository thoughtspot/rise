import { buildSchema, graphql } from 'graphql';
import nock from 'nock';
import { makeExecutableSchema } from '@graphql-tools/schema';
// import {
//  describe, expect, test, afterAll, beforeAll, afterEach,
// } from 'vitest';
import fs from 'fs';
import path from 'path';
import { riseDirectiveTransformer, riseDirectiveTypeDefs } from '../src/index';

const typeDefs = fs.readFileSync(path.join(__dirname, './schema.graphql'), 'utf8');

// let schema = makeExecutableSchema({
//   typeDefs: [
//     riseDirectiveTypeDefs,
//     typeDefs,
//   ],
// });

let schema = buildSchema([riseDirectiveTypeDefs, typeDefs].join('\n'));
// console.log(buildSchema.prototype, await getLoc(buildSchema));

class ApolloError extends Error {}

schema = riseDirectiveTransformer({
  baseURL: 'https://rise.com/callosum/v1',
  forwardheaders: ['Authorization', 'cookie'],
  contenttype: 'application/x-www-form-urlencoded',
  resultroot: 'data',
  errorroot: 'error',
  ErrorClass: ApolloError,
})(schema);

beforeAll(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});

const a = function () {
  return {};
};
describe('Should call the Target', () => {
  test('with the correct headers', async () => {
    nock('https://rise.com/callosum/v1', {
      reqheaders: {
        Authorization: 'Bearer 123',
        cookie: 'a=a',
      },
    })
    .get('/v2/auth/session/user')
    .reply(200, function () {
      console.log(this.req.headers);
      return {
        data: {
          id: '123',
          name: 'John',
          email: 'john@doe.com',
          extra: 'extra',
        },
      };
    });

    return graphql({
      schema,
      source: `
        query {
          getSessionDetails {
            name
            email
            id
          }
        }
      `,
      contextValue: {
        req: {
          headers: {
            Authorization: 'Bearer 123',
            cookie: 'a=a',
            foo: 'bar',
          },
        },
      },
    }).then((response) => {
      console.log(response);
    });
  });

  test.todo('with the correct body');
});

describe('Should return the correct data', () => {
  test.todo('when there is no resultroot');

  test.todo('when there is a resultroot');

  test.todo('when there are setters');
});
