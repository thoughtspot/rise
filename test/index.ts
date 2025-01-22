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

const GQL_BASE_URL = 'https://rise.com/gql/v1';

const { riseDirectiveTransformer: gqlTransformer, riseDirectiveTypeDefs: gqlTypeDefs } = rise({
  baseURL: GQL_BASE_URL,
  name: 'gqlrise',
  apiType: 'gql',
});
console.log([riseDirectiveTypeDefs, gqlTypeDefs, typeDefs].join('\n'));
let schema = buildSchema([riseDirectiveTypeDefs, gqlTypeDefs, typeDefs].join('\n'));

schema = gqlTransformer(riseDirectiveTransformer(schema));

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
    });
  });
});

describe('tests for query params', () => {
  test('when array is passed for query params and one param is not passed', async () => {
    nock('https://rise.com/callosum/v1')
      .get(() => true)
      .reply(200, function () {
        const query = new URLSearchParams(this.req.path.split('?')[1]);
        expect(query.get('params')).toEqual('');
        expect(query.get('paramsInt')).toEqual('');
        expect(query.get('test')).toEqual('yes');
        return {
          data: {
            params: query.get('params'),
            paramsInt: query.get('paramsInt'),
          },
        };
      });
    const res = await graphql({
      schema,
      source: `
        mutation {
          getUserWithQueryParam(identifier: "test", qParamsStr: ["a c", "b d", "1"]) {
            params
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
    });

    expect(res.errors).toBeUndefined();
  });

  test('when multiple array is passed', async () => {
    nock('https://rise.com/callosum/v1')
      .get(() => true)
      .reply(200, function () {
        const query = new URLSearchParams(this.req.path.split('?')[1]);
        expect(query.get('params')).toEqual('');
        expect(query.get('paramsInt')).toEqual('');
        expect(query.get('test')).toEqual('yes');
        return {
          data: {
            params: query.get('params'),
            paramsInt: query.get('paramsInt'),
          },
        };
      });

    const res2 = await graphql({
      schema,
      source: `
      mutation {
        getUserWithQueryParam(identifier: "test", qParamsStr: ["a c", "b d", "1"], qParamsInt: [1,2,3]) {
          params
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
    });
    expect(res2.errors).toBeUndefined();
  });

  test('when object is passed for query param', async () => {
    nock('https://rise.com/callosum/v1')
      .get(() => true)
      .reply(200, function () {
        const query = new URLSearchParams(this.req.path.split('?')[1]);
        expect(query.get('params')).toEqual('');
        expect(query.get('paramsInt')).toEqual('');
        expect(query.get('test')).toEqual('yes');
        expect(query.get('paramObj')).toEqual('');
        return {
          data: {
            params: query.get('params'),
            paramsInt: query.get('paramsInt'),
          },
        };
      });

    const res3 = await graphql({
      schema,
      source: `
      mutation {
        getUserWithQueryParam(identifier: "test", qParamsStr: ["a c", "b d", "1"], qParamsInt: [1,2,3], paramObj: { email: "yes" }) {
          params
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
    });
    expect(res3.errors).toBeUndefined();
  });

  test('when array of object is passed', async () => {
    const testIdentifier = 'test123';
    nock('https://rise.com/callosum/v1')
      .get(() => true)
      .reply(200, function () {
        const query = new URLSearchParams(this.req.path.split('?')[1]);
        expect(this.req.path).toContain(`/v2/users/${testIdentifier}`);
        expect(query.get('paramObj')).toEqual('');
        return {
          data: {
            params: query.get('paramObj'),
          },
        };
      });
    const res = await graphql({
      schema,
      source: `
      mutation {
        getUserWithQueryParamArrayObject(identifier: "${testIdentifier}", paramObj: [{email: "hi"}]) {
          params
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
    });

    expect(res.errors).toBeUndefined();
  });
});

describe('tests for path param', () => {
  test('when encoded data is passed for path param', async () => {
    const testIdentifier = 'test1%20test2';
    nock('https://rise.com/callosum/v1')
      .get(() => true)
      .reply(200, function () {
        const query = new URLSearchParams(this.req.path.split('?')[1]);
        expect(this.req.path).toContain(`/v2/users/${testIdentifier}`);
        expect(query.get('params')).toEqual(null);
        return {
          data: {
            params: query.get('params'),
            paramsInt: query.get('paramsInt'),
          },
        };
      });
    const res = await graphql({
      schema,
      source: `
        mutation {
          getUserWithQueryParamArrayObject(identifier: "test1%20test2") {
            params
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
    });

    expect(res.errors).toBeUndefined();
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

describe('Should handle gql type', () => {
  test('when gql query is executed should return data as expected', () => {
    nock(GQL_BASE_URL, {
    })
      .post('')
      .reply(200, (...args) => ({
        data: {
          getGQLSessionDetails: {
            id: '123',
            name: 'John',
            email: 'john@doe.com',
            extra: 'extra',
          },
        },
      }));

    const contextValue = {
      req: {
        headers: {
          Authorization: 'Bearer 123',
          cookie: 'a=a',
          foo: 'bar',
        },
      },
    };

    return graphql({
      schema,
      source: `
        query getSession($sessionId: String, $asd: String) {
          getGQLSessionDetails(sessionId: $sessionId, asd: $asd) {
            name
            email
            id
          }
        }
      `,
      contextValue,
      variableValues: {
        sessionId: '1234',
        asd: 'abc'
      }
    }).then((response: any) => {
      expect(response?.data?.getGQLSessionDetails).toBeDefined();
      expect(response?.data?.getGQLSessionDetails).toMatchObject({
        name: 'John',
        id: '123',
      });
    });
  });
  test('when gql query with args wrapper is executed should return data as expected', () => {
    const apiScope = nock(GQL_BASE_URL, {
    })
    // Expect Query and variables to be wrapped with the args wrapper.
      .post('', {
        query: `query getSession($session: ACSession) {\n  getGQLSessionDetailsWithWrap(session: $session) {\n    name\n    email\n    id\n  }\n}`,
        variables: { session: {sessionId: "1234", asd:"abc"}}}
      )
      .reply(200, (...args) => ({
        data: {
          session:{
            getGQLSessionDetailsWithWrap: {
              id: '123',
              name: 'John',
              email: 'john@doe.com',
              extra: 'extra',
            },
          }
        }
      }));

      const contextValue = {
        req: {
          headers: {
            Authorization: 'Bearer 123',
            cookie: 'a=a',
            foo: 'bar',
          },
        },
      };

    return graphql({
      schema,
      source: `
        query getSession($sessionId: String, $asd: String) {
          getGQLSessionDetailsWithWrap(sessionId: $sessionId, asd: $asd) {
            name
            email
            id
          }
        }
      `,
      contextValue,
      variableValues: {
        sessionId: '1234',
        asd: 'abc'
      }
    }).then((response: any) => {
      expect(apiScope.isDone()).toBe(true);
      expect(response?.data?.getGQLSessionDetailsWithWrap).toBeDefined();
      expect(response?.data?.getGQLSessionDetailsWithWrap).toMatchObject({
        name: 'John',
        id: '123',
      });
    });
  });

  test('when there is a error in gql query, the error should be responded back', () => {
    nock(GQL_BASE_URL, {
    })
      .post('')
      .reply(500, {
        errors: [
          {
            message: 'Error: Something went wrong!',
            path: [
              'getGQLSessionDetails',
            ],
            extensions: {
              service: 'UPSTREAM',
              code: 'UPSTREAM_FAILURE',
              exception: {
                message: 'Error: Something went wrong!',
                service: 'UPSTREAM',
                upstreamResponse: {},
                stacktrace: ['GraphQLError: Error: Something went wrong!'],
              },
            },
          },
        ],
      });

    const contextValue = {
      req: {
        headers: {
          Authorization: 'Bearer 123',
          cookie: 'a=a',
          foo: 'bar',
        },
      },
    };

    return graphql({
      schema,
      source: `
         query getSession($sessionId: String, $asd: String) {
          getGQLSessionDetails(sessionId: $sessionId, asd: $asd) {
            name
            email
            id
          }
        }
      `,
      contextValue,
    }).then((response: any) => {
      expect(response?.data?.getGQLSessionDetails).toBeUndefined();
      expect(response.errors).toBeDefined();
      // TODO: fix error response handling add updated test here.
    });
  });
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

  let schemaTest = buildSchema([riseDirectiveTypeDefsTest, gqlTypeDefs, typeDefs].join('\n'));

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

  test('when text content type is used', () => {
    nock(BASE_URL, {
      reqheaders: {
        'Content-Type': (headerValue) => {
          // backend should receive the same content type as the user sent
          expect(headerValue).toEqual('text/plain; UTF-8');
          return true;
        },
      },
    })
      .post('/v2/search')
      .reply(415, (uri, body, cb) => {
        // backend should receive the same body as the user sent
        expect(body).toEqual('Text body passed by user');
        cb(
          null,
          body,
        );
      }, {
        'Content-Type': 'text',
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
        req: {
          orginalHeaders: {
            'CoNtEnT-tYpE': 'text/plain; UTF-8',
          },
          body: 'Text body passed by user',
        },
      },
    }).then(async (res) => {
      expect(res?.errors?.[0].message).toEqual(JSON.stringify({
        message: 'Text body passed by user',
      }));
    });
  });
});
