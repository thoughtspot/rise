import fetch from 'node-fetch';
import { GraphQLFieldConfig } from 'graphql';
import { print } from 'graphql/language/printer';
import { RiseDirectiveOptions, getReqHeaders, processResHeaders } from './common';

export interface RiseDirectiveOptionsGql extends RiseDirectiveOptions {
    apiType: 'gql';
}

export function gqlResolver(
    riseDirective,
    options: RiseDirectiveOptionsGql,
    fieldConfig: GraphQLFieldConfig<any, any, any>,
) {
    const url = options.baseURL;

    fieldConfig.resolve = (source, args, context, info) => {
        let urlToFetch = url;
        let originalContext = context;
        let body = JSON.stringify({
            query: print(info.operation),
            variables: info.variableValues,
        });
        const reqHeaders = getReqHeaders(riseDirective, options, context);

        console.debug('[Rise] Downstream URL', urlToFetch);
        return fetch(urlToFetch, {
            method: 'POST',
            headers: reqHeaders,
            body,
        })
            .then((response) => {
                processResHeaders(response, originalContext);
                return response.json();
            })
            .then((response) => {
                if (response.errors) {
                    // TODO: Update the error class to passthough error context more correctly.
                    throw new options.ErrorClass(
                        response.statusText,
                        response.status,
                        response.errors,
                    );
                }

                return response.data[info.fieldName];
            });
    };
}
