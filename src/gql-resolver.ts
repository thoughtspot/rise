import fetch from 'node-fetch';
import { GraphQLFieldConfig } from 'graphql';
import { print } from 'graphql/language/printer';
import _ from 'lodash';
import { RiseDirectiveOptions, getReqHeaders, processResHeaders } from './common';
import { generateBodyFromTemplate } from './rest-resolver';

export interface RiseDirectiveOptionsGql extends RiseDirectiveOptions {
    apiType: 'gql';
}

/**
 * Wraps arguments in a object of graphql query, when a wrapping object name and Class is defined.
 *
 * eg: Given wrapping object name 'session' and class 'ACSession'
 * query getSession($sessionId: String, $sessionName: String) {
 *   getGQLSessionDetails(sessionId: $sessionId, sessionName: $sessionName) {
 *     name
 *     email
 *     id
 *   }
 * }
 *
 *    ||  ||  ||  ||
 *    \/  \/  \/  \/
 *
 * query getSession($session: ACSession) {
 *   getGQLSessionDetails(session: $session) {
 *     name
 *     email
 *     id
 *   }
 * }
 *
 * Also takes care of adding structuring with the object name while making graphql call.
 *
 * fetch('/graphql', { query, variables: {session: { sessionId, sessionName }}})
 *  .then(res => res.session);
 *
 */
// eslint-disable-next-line default-param-last
function wrapArgumentsInGql(query = '', info, argwrapper) {
    if (argwrapper.name) {
        const { name: wrapperName, type: wrapperClass } = argwrapper;
        const operationType = info.operation.operation;
        const operationName = info.operation.name?.value;
        const fieldName = info.fieldName;

        // Regex to replace query getOpName($var1: VarType1, $var2: VarType2 ...)
        // to query getOpName($wrappedType: WrappedType)
        const createOpNameRegex = (opType, opName) => new RegExp(`\\b${opType}\\s+${opName}\\s*\\([^()]*\\)`, 'g');

        // Regex to replace GetOpName(var1: $var1, var2: $var2, ...)
        // to GetOpName(wrappedType: $wrappedType)
        const createFieldNameRegex = (field) => new RegExp(`\\b${field}\\s*\\([^()]*\\)`, 'g');

        // Replace operation and field names carefully
        return query
            // Replace the operation and operationName
            .replace(
                createOpNameRegex('query', operationName),
                `${operationType} ${operationName}($${wrapperName}: ${wrapperClass})`,
            )
            // Replace the fieldName in the query body
            .replace(
                createFieldNameRegex(fieldName),
                `${fieldName}(${wrapperName}: $${wrapperName})`,
            );
    }
    return query;
}

function mapKeysDeep(obj: any, keyMap: Record<string, string> = {}): any {
    if (Array.isArray(obj)) {
        return obj.map((item) => mapKeysDeep(item, keyMap));
    }
    if (obj !== null && typeof obj === 'object') {
        const mapped: Record<string, any> = {};
        Object.keys(obj).forEach((key) => {
            const newKey = keyMap[key] || key;
            mapped[newKey] = mapKeysDeep(obj[key], keyMap);
        });
        return mapped;
    }
    return obj;
}

export function gqlResolver(
    riseDirective,
    options: RiseDirectiveOptionsGql,
    fieldConfig: GraphQLFieldConfig<any, any, any>,
) {
    const url = options.baseURL;
    let { argwrapper, gqlVariables, responseKeyFormat } = riseDirective;

    fieldConfig.resolve = (source, args, context, info) => {
        let urlToFetch = url;
        let originalContext = context;
        let query = print(info.operation);

        const wrappingObject = argwrapper && argwrapper.name;

        if (argwrapper) {
            query = wrapArgumentsInGql(query, info, argwrapper);
        }

        const variables = gqlVariables
            ? generateBodyFromTemplate(gqlVariables, args)
            : info.variableValues;

        console.debug('[Rise] GQL - Variables', variables);

        let body = JSON.stringify({
            query,
            variables: wrappingObject ? { [wrappingObject]: variables } : variables,
        });
        console.debug('[Rise] GQL request body:', body);

        const reqHeaders = getReqHeaders(riseDirective, options, originalContext);

        console.debug('[Rise] GQL - Downstream URL and operation', urlToFetch, info.fieldName);
        return fetch(urlToFetch, {
            method: 'POST',
            headers: reqHeaders,
            body,
        })
            .then(async (response) => {
                processResHeaders(response, originalContext);
                const data = await response.json();
                if (responseKeyFormat) {
                    console.debug('[Rise] GQL - Response key format', responseKeyFormat);
                    let keyMap = {};
                    if (typeof responseKeyFormat === 'string') {
                        try {
                            keyMap = JSON.parse(responseKeyFormat);
                        } catch (error) {
                            console.error('[Rise] GQL - Failed to parse responseKeyFormat', error);
                        }
                    }
                    return mapKeysDeep(data, keyMap);
                }
                return data;
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
