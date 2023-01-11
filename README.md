# Rise
[![npm version](https://badge.fury.io/js/@thoughtspot%2Frise.svg)](https://badge.fury.io/js/@thoughtspot%2Frise) ![NodeJS Build](https://github.com/thoughtspot/rise/actions/workflows/main.yml/badge.svg) [![Coverage Status](https://coveralls.io/repos/github/thoughtspot/rise/badge.svg?branch=main)](https://coveralls.io/github/thoughtspot/rise?branch=main)

Rise above "REST". A declarative schema driven way to convert REST endpoints to GraphQL.

## Installation

```
npm i @thoughtspot/rise
```

## Usage

```js
import { rise } from "@thoughtspot/rise";
import { buildSchema } from 'graphql'; // or Apollo or something else.
import typeDefs from './schema.graphql'; // Or your preferred method.


const  { riseDirectiveTransformer, riseDirectiveTypeDefs } = rise({
  // Base URL of the underlying REST Service.
  baseURL: "https://api.service.com/",        
  
  // Forward these headers from the graphql call to REST server.
  forwardheaders: ["cookie", "Authorization"],  
  
  // This is the name of the dynamically created directive.
  name: 'myAwesomeService',                     
  
  // The errors will be thrown from the directive wrapped 
  // in an instance of this class.
  // can be put to "ApolloError" for example to easily use
  // Apollo's error system.
  ErrorClass: ApolloError,
  
  /* 
    Can also specify other directive props here which apply to all REST calls,
    Look at the usage below for all possible props.
  */
});

let schema = buildSchema([
  riseDirectiveTypeDefs,
  typeDefs,
]);

schema = riseDirectiveTransformer(schema);

// .. Serve the schema using your favorite Graphql Server.
```

```graphql
# schema.graphql

type Query {
  getUser(id: String!): User!
  @myAwesomeService(
    # path within the REST service  
    path: "/v1/user/$id", 
    
    # API call method GET/POST/PUT/DELETE
    method: "GET",   
    
    # Any additional headers to be sent.
    headers: {
      "accept": "application/json"
    }, 
    
    # content type header value.
    contenttype: "application/json",
    
    # The path to read the the response payload from the response json body.
    resultroot: "data",     
    
    # The path to read the error body from the error response json.
    errorroot: "error",     
    
    # setters are transformations which can be done on the response payload. 
    # For example here 'username' field in gql schema will be
    # mapped to the `header.name` field inside the response json.
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
    
    # postbody can be used to create a custom body for a POST request,
    # this is a lodash template and access to the graphql params is
    # via the `args` keyword.
    # The post body is automatically created from `args` if this option
    # is omitted.
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

## Architecture

<img src="https://raw.githubusercontent.com/thoughtspot/rise/main/Untitled(2).jpg" width=600 alt="ThoughtSpot" />
<br>



## Credits

Heavily inspired from [StepZen](https://stepzen.com/docs/custom-graphql-directives/directives#-rest).
