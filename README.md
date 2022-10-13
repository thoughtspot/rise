# Rise
[![npm version](https://badge.fury.io/js/@thoughtspot%2Frise.svg)](https://badge.fury.io/js/@thoughtspot%2Frise) ![NodeJS Build](https://github.com/thoughtspot/rise/actions/workflows/main.yml/badge.svg) [![Coverage Status](https://coveralls.io/repos/github/thoughtspot/rise/badge.svg?branch=main)](https://coveralls.io/github/thoughtspot/rise?branch=main)

Rise above "REST". A declarative schema driven way to convert REST endpoints to GraphQL.

## Installation

```
npm i @thoughtspot/rise
```

## Usage

```graphql
type Query {
  getUser(id: String!): User!
  @myAwesomeService(
    path: "/v1/user/$id", 
    method: "GET",
    headers: {
      "accept": "application/json"
    },
    contenttype: "application/json",
    resultroot: "data",
    errorroot: "error",
    setters:[{
      "field": "username", "path": "header.name"
    }]
  )
}

type Mutation {
  createUser(name: String!, groups: [String!], email: String, phone: String, address: String): User!
  @myAwesomeService(
    path: "/v1/user"
    method: "POST",
    contenttype: "application/x-www-form-urlencoded",
    resultroot: "data",
    errorroot: "error",
    postbody: """
    {
      "username": "<%= args.name %>",
      "groups": "<%= JSON.stringify(args.groups) %>",
      "properties": {
        "email": "<%= args.email %>",
        "address": "<%= args.address %>",
        "phone": "<%= args.phone %>",
      }
    }
    """
  )
}
```

```js
import { rise } from "@thoughtspot/rise";
import { buildSchema } from 'graphql';
import typeDefs from 'schema.graphql'; // Or your preferred method.


const  { riseDirectiveTransformer, riseDirectiveTypeDefs } = rise({
  baseURL: "https://api.service.com/",
  forwardheaders: ["cookie", "Authorization"],
  name: 'myAwesomeService',
  /* 
    Can also specify other directive props here which apply to all REST calls
  */
});

let schema = buildSchema([
  riseDirectiveTypeDefs,
  typeDefs,
]);

schema = riseDirectiveTransformer(schema);

// .. Serve the schema using your favorite Graphql Server.
```

## Credits

Heavily inspired from [StepZen](https://stepzen.com/docs/custom-graphql-directives/directives#-rest).
