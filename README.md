# Rise

Rise above "REST". A declarative schema driven way to convert REST endpoints to GraphQL.

## Usage

```graphql
type Query {
  getUser(id: String!): User!
  @rise(
    path: "/v1/user", 
    method: "GET",
    headers: {
      "Authorization": "Bearer abcde"
    },
    contenttype: "application/json",
    resultroot: "data",
    errorroot: "error",
    setters:[{
      "field": "username", "path": "header.name"
    }]
  )
}
```

```js
import { riseDirectiveTransformer, riseDirectiveTypeDefs } from "@thoughtspot/rise";
import { buildSchema } from 'graphql';
import typeDefs from 'schema.graphql'; // Or your preferred method.

let schema = buildSchema([
  riseDirectiveTypeDefs,
  typeDefs,
]);

schema = riseDirectiveTransformer({
  baseURL: "https://api.service.com/",
  forwardheaders: ["cookie"],
  /* 
    Can also specify other directive props here which apply to all REST calls
  */
})(schema);

// .. Serve the schema using your favorite Graphql Server.
```
