import { buildSchema, graphql } from 'graphql';
import nock from 'nock';
import { makeExecutableSchema } from '@graphql-tools/schema';
// import {
//  describe, expect, test, afterAll, beforeAll, afterEach,
// } from 'vitest';
import fs from 'fs';
import path from 'path';
import { rise } from '../src/index';

const typeDefs = fs.readFileSync(path.join(__dirname, './schema.graphql'), 'utf8');

class ApolloError extends Error { }

const BASE_URL = 'https://rise.com/callosum/v1';

const { riseDirectiveTransformer, riseDirectiveTypeDefs } = rise({
  baseURL: BASE_URL,
  forwardheaders: ['Authorization', 'cookie'],
  contenttype: 'application/x-www-form-urlencoded',
  resultroot: 'data',
  errorroot: 'error',
  ErrorClass: ApolloError,
  name: 'service',
});

let schema = buildSchema([riseDirectiveTypeDefs, typeDefs].join('\n'));

schema = riseDirectiveTransformer(schema);

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
        expect(this.req.headers.authorization).toEqual(['Bearer 123']);
        expect(this.req.headers.cookie).toEqual(['a=a']);
        expect(this.req.headers.foo).toBeUndefined();
        expect(this.req.headers.xfoo).toEqual(['bar']);
        return {
          data: {
            id: '123',
            name: 'John',
            email: 'john@doe.com',
            extra: 'extra',
            nested: {
              key: 'value',
            },
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
            key
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
      expect(response?.data?.getSessionDetails).toMatchObject({
        name: 'John',
        email: 'john@doe.com',
        id: '123',
        key: 'value',
      });
    });
  });

  test.todo('with the correct body');

  test('Nested query', async () => {
    nock('https://rise.com/callosum/v1', {
      reqheaders: {
        Authorization: 'Bearer 123',
        cookie: 'a=a',
      },
    })
      .post('/v2/users/search')
      .reply(200, () => ({
        data: {
          id: '123',
          name: 'John',
          email: 'john@doe.com',
          extra: 'extra',
        },
      }));

    nock('https://rise.com/callosum/v1', {
      reqheaders: {
        Authorization: 'Bearer 123',
        cookie: 'a=a',
      },
    })
      .get('/v2/users/foo/history?from=2020-01-01')
      .reply(200, () => ({
        data: ['txn1', 'txn2'],
      }));

    return graphql({
      schema,
      source: `
          mutation {
            getUser(identifier: "foo") {
              name
              email
              id
              history(from: "2020-01-01")
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
      expect(response?.data?.getUser).toMatchObject({
        name: 'John',
        email: 'john@doe.com',
        id: '123',
        history: ['txn1', 'txn2'],
      });
    });
  });

  test('with the correct headers, for repeated call', async () => {
    nock('https://rise.com/callosum/v1', {
      reqheaders: {
        Authorization: 'Bearer 123',
        cookie: 'a=a',
      },
    })
      .get('/v2/auth/session/user')
      .reply(200, function () {
        console.log(this.req.headers);
        expect(this.req.headers.authorization).toEqual(['Bearer 123']);
        expect(this.req.headers.cookie).toEqual(['a=a']);
        return {
          data: {
            id: '123',
          },
        };
      });

    await graphql({
      schema,
      source: `
          query {
            getSessionDetails {
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
    });

    nock('https://rise.com/callosum/v1', {
      reqheaders: {
        cookie: 'a=a',
      },
    })
      .get('/v2/auth/session/user')
      .reply(200, function () {
        console.log(this.req.headers);
        expect(this.req.headers.authorization).toBeUndefined();
        expect(this.req.headers.cookie).toEqual(['a=a']);
        return {
          data: {
            id: '123',
          },
        };
      });

    return graphql({
      schema,
      source: `
        query {
          getSessionDetails {
            id
          }
        }
      `,
      contextValue: {
        req: {
          headers: {
            cookie: 'a=a',
            foo: 'bar',
          },
        },
      },
    }).then((response) => {
      console.log(response.data, response.errors);
    });
  });
});

describe('Should return the correct data', () => {
  test.todo('when there is no resultroot');

  test('when there is a resultroot and data is an array', () => {
    nock('https://rise.com/callosum/v1', {
    })
      .post('/v2/search')
      .reply(200, (...args) => ({
        data: [{
          id: '123',
          name: 'John',
          email: 'john@doe.com',
          extra: 'extra',
        }, {
          id: '456',
          name: 'Jane',
          email: 'jane@doe.com',
        }],
      }));

    return graphql({
      schema,
      source: `
        query {
          search(query: "foo") {
            name
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
    }).then((response: any) => {
      expect(response?.data?.search.length).toBe(2);
      expect(response?.data?.search[0]).toMatchObject({
        name: 'John',
        id: '123',
      });
    });
  });

  test('When there is empty data returned', async () => {
    nock('https://rise.com/callosum/v1', {
    })
      .post('/v2/auth/session/login')
      .reply(204);

    return graphql({
      schema,
      source: `
        mutation {
          login(username: "foo", password: "bar") 
        }
      `,
      contextValue: {
        req: {
          headers: {
            Authorization: 'Bearer 123',
          },
        },
      },
    }).then((response: any) => {
      expect(response?.data?.login).toBeNull();
    });
  });

  test.todo('when there are setters');
});

class TestError extends Error {
  statusText: string;

  status: number;

  message: string;

  constructor(statusText: string, status: number, message: string) {
    super();
    this.statusText = statusText;
    this.status = status;
    this.message = JSON.stringify(message);
  }
}

describe('Parse data according to the content type', () => {
  const {
    riseDirectiveTransformer: riseDirectiveTransformerTest,
    riseDirectiveTypeDefs: riseDirectiveTypeDefsTest,
  } = rise({
    baseURL: BASE_URL,
    forwardheaders: ['Authorization', 'cookie'],
    contenttype: 'application/x-www-form-urlencoded',
    resultroot: 'data',
    errorroot: 'errorTest',
    ErrorClass: TestError,
    name: 'service',
  });

  let schemaTest = buildSchema([riseDirectiveTypeDefsTest, typeDefs].join('\n'));

  schemaTest = riseDirectiveTransformerTest(schemaTest);

  test('when text/html is returned as error', () => {
    nock(BASE_URL, {}).post('/v2/search')
      .reply(500, '<html></html>', {
        'Content-Type': 'text/html',
      });
    return graphql({
      schema: schemaTest,
      source: `
      query {
        search(query: "foo") {
          name
          id
        }
      }
      `,
      contextValue: {
        req: {},
      },
    }).then(async (res) => {
      expect(res?.errors?.[0].message).toEqual(JSON.stringify({
        message: '<html></html>',
      }));
    });
  });

  test('when application/json is returned as error', () => {
    nock(BASE_URL, {}).post('/v2/search')
      .reply(400, { errorTest: { message: { debug: 'Some error' } } }, {
        'Content-Type': 'application/json',
      });
    return graphql({
      schema: schemaTest,
      source: `
      query {
        search(query: "foo") {
          name
          id
        }
      }
      `,
      contextValue: {
        req: {},
      },
    }).then(async (res) => {
      expect(res?.errors?.[0].message).toEqual(JSON.stringify({
        message: { debug: 'Some error' },
      }));
    });
  });

  test('when multipart/form-data contenttype is used', () => {
    nock(BASE_URL, {
      reqheaders: {
        'Content-Type': (headerValue) => {
          expect(headerValue).toMatch(/^multipart\/form-data; boundary=/);
          return true;
        },
      },
    })
      .post('/v2/users/multipart')
      .reply(200, (...args) => ({ data: { name: 'success' } }), {
        'Content-Type': 'application/json',
      });
    return graphql({
      schema: schemaTest,
      source: `
      mutation {
        getUserMultiPart(identifier: "test") {
          name
        }
      }
      `,
      contextValue: {
        req: {},
      },
    }).then(async (res) => {
      expect((res?.data as any)?.getUserMultiPart?.name).toBe('success');
    });
  });
});
