import { createStore, Action, combineReducers } from 'redux';
import ts, { textSpanContainsTextSpan } from 'typescript';
import { readFile, writeFile } from 'fs';
import { promisify } from 'util';
import path from 'path';

enum TheScope {
    Global,
    Function,
    Statement
}

interface IHasName {
    name: string;
}

interface IHasStatements {
    statements: number,
    lines: string[]
}

interface IFunction extends IHasName, IHasStatements {
    args: Map<string, string>,
    ret: string
}

interface ISourceFile extends IHasName, IHasStatements {
}

interface ProgramState {
    scope: TheScope[],
    functions: IFunction[],
    sourceFile?: ISourceFile
    statements: ts.Statement[],
}

interface Context extends Action<ts.SyntaxKind> {
    node: ts.Node
}

type Thing = ProgramState;

function isStatement(node: ts.Node): boolean {
    let ret =
        //ts.isBlock(node) ||
        ts.isVariableStatement(node) ||
        ts.isEmptyStatement(node) ||
        ts.isExpressionStatement(node) ||
        ts.isIfStatement(node) ||
        ts.isDoStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isContinueStatement(node) ||
        ts.isBreakStatement(node) ||
        ts.isBreakOrContinueStatement(node) ||
        ts.isReturnStatement(node) ||
        ts.isWithStatement(node) ||
        ts.isSwitchStatement(node) ||
        ts.isLabeledStatement(node) ||
        ts.isThrowStatement(node) ||
        ts.isTryStatement(node) ||
        ts.isDebuggerStatement(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isVariableDeclarationList(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node);
    return ret;
}

function createReducer(initialState: Thing, handlers: any) {
    return function reducer(state = initialState, action: Context): Thing {

        // if (!action.node) return state;
        let ret = state;
        // if (isStatement(action.node) && !ts.isSourceFile(action.node)) {
        //     let scope: IHasStatements | undefined;
        //     //let first = false;
        //     for (let i = ret.scope.length - 1; i >= 0; i--) {
        //         scope = getScope(ret, i);
        //         if (!scope) continue;
        //         //if (first /*|| !ts.isBlock(action.node) */) {
        //             scope.statements--;
        //             //first = true;
        //         //}
        //     }
        //     scope = getCurrentScope(ret);
        //     if (scope.statements == -1) {
        //         ret.scope.pop();
        //     }
        // }

        if (handlers.hasOwnProperty(ts.SyntaxKind[action.type])) {
            ret = handlers[ts.SyntaxKind[action.type]](state, action);
        } else {
            ret = state;
        }

        // if (isStatement(action.node)) {
        //     ret.statements.push(action.node as ts.Statement);
        // }
        return ret;
    }
}

function isInScope(state: Thing, scope: TheScope) {
    return state.scope[state.scope.length - 1] === scope;
}

function currentScopeName(state: Thing): string | undefined {
    return state.functions.length > 0 ? state.functions[state.functions.length - 1].name : undefined;
}

function getCurrentScope(state: Thing, back: number = 0): IHasStatements {
    let idx = state.scope.length - 1 - back;
    if (idx < 0) idx = 0;
    const currentScope = state.scope[idx];
    switch (currentScope) {
        case TheScope.Global: return state.sourceFile!;
        case TheScope.Function: return state.functions[state.functions.length - 1];
        case TheScope.Statement: return getCurrentScope(state, back + 1);
    }
}

function getCurrentFunction(state: Thing, back: number = 0): IHasStatements {
    return state.functions[state.functions.length - 1];
}

function getScope(state: Thing, idx: number): IHasStatements | undefined {
    const currentScope = state.scope[idx];
    switch (currentScope) {
        case TheScope.Global: return state.sourceFile!;
        case TheScope.Function: return state.functions[state.functions.length - 1];
        case TheScope.Statement: return undefined;
    }
}

function updateObject(oldObject: any, newValues: any) {
    // Encapsulate the idea of passing a new object as the first parameter
    // to Object.assign to ensure we correctly copy data instead of mutating
    return Object.assign({}, oldObject, newValues)
}

function updateItemInArray<T extends IHasName>(array: T[], itemId: string, updateItemCallback: (obj: T) => T[]) {
    return array.map(item => {
        if (item.name !== itemId) {
            // Since we only want to update one item, preserve all others as they are now
            return item;
        }
        // Use the provided callback to create an updated item
        return updateItemCallback(item);
    });
}

function updateItemByIndex(array: string[], itemId: number, updateItemCallback: (obj: string) => string[]) {
    return array.map((item, index) => {
        if (index !== itemId) {
            // Since we only want to update one item, preserve all others as they are now
            return item;
        }
        // Use the provided callback to create an updated item
        return updateItemCallback(item);
    });
}

function updateCurrentFunctionData(state: Thing, data: any): Thing {
    const current = currentScopeName(state);
    const funcs = updateItemInArray(state.functions, current!, f => updateObject(f, data))
    return updateObject(state, { functions: funcs });
}

const handlers = {
    SourceFile: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.SourceFile;
        const ret = updateObject(state, { sourceFile: { name: node.fileName, statements: node.statements.length } });
        ret.scope.push(TheScope.Global);
        return ret;
    }
    ,
    FunctionDeclaration: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.FunctionDeclaration;
        const ret = updateObject(state, {});
        const symbol = checker.getSymbolAtLocation(node);
        const type = checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(node)!);
        console.log(`${ts.TypeFlags[type.flags].toString()} ${checker.typeToString(type)}`);
        //const type = checker.getDeclaredTypeOfSymbol(symbol!);
        //console.log(ts.SyntaxKind[node.type!.kind])
        //console.log(checker.typeToString(type));

        ret.functions = state.functions.concat({ name: '', args: new Map<string, string>(),
            ret: ts.TypeFlags[type.flags].toString(),
            statements: -2, lines: []
        })
        ret.scope.push(TheScope.Function);
        return ret;
    }
    ,
    Identifier: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.Identifier;
        console.log(node.text)
        if (isInScope(state, TheScope.Function)) {
            return updateCurrentFunctionData(state, { name: node.text });
        }
        return state;
    }
    ,
    StringKeyword: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.KeywordTypeNode;
        // if (isInScope(state, TheScope.Function)) {
        //     return updateCurrentFunctionData(state, { ret: 'string' });
        // }
        return state;
    }
    ,
    Block: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.Block;
        return updateCurrentFunctionData(state, { statements: node.statements.length == 0 ? 1 : node.statements.length });
    }
    ,
    ExpressionStatement: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.ExpressionStatement;
        //console.log(node)
        return state;
    }
    ,
    PropertyAccessExpression: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.PropertyAccessExpression;
        console.log(node. name.escapedText)
        return state;
    }
    ,
    FirstTemplateToken: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.LiteralExpression;
        console.log(node.text)
        return state;
    }
    ,
    ReturnStatement: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.ReturnStatement;
        const ret = updateObject(state, {});
        getCurrentFunction(ret).lines.push('return');
        return ret;
    }
    ,
    StringLiteral: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.StringLiteral;
        console.log(node.text)
        const ret = state;
        const scope = getCurrentScope(ret);
        if (!scope.lines) scope.lines = [''];
        let val = scope.lines[scope.lines.length - 1];
        val = `${val} "${node.text}"`;
        scope.lines[scope.lines.length - 1] = val;
        return updateCurrentFunctionData(state, { lines: scope.lines })
    }
    ,
    CallExpression: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.CallExpression;
        console.log(`arguments: ${node.arguments.map(x => (<ts.Identifier>x).text)}`);
        return state;
    }
    ,
    IfStatement: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.IfStatement;
        console.log(node)
        return state;
    }
    ,
    VariableDeclaration: (state: Thing, action: Context): Thing => {
        const node = action.node as ts.VariableDeclaration;
        console.log((<ts.Identifier>node.name).escapedText)
        return state;
    }
    ,
};

const reducers = createReducer({ scope: [], functions: [], statements: [] }, handlers)

const methods: any[] = [];
const currentMethod = () =>
    methods.length > 0
        ? methods[methods.length - 1]
        : undefined;

function visitor<T extends ts.Node>(node: ts.Node): T {
    console.log(`Visiting ${node} ${ts.SyntaxKind[node.kind]}`);
    // let method = currentMethod()!;
    store.dispatch({ type: node.kind, node });
    ts.forEachChild(node, visitor);
    return <T>node;
};


let ctx: ts.TransformationContext;
let store = createStore(reducers);
store.subscribe(() => console.log(store.getState()));

const sources: ts.SourceFile[] = [];
const sourceFiles = ["tests/app/another.ts"];
let checker: ts.TypeChecker;
(async () => {
    let read = promisify(readFile);

    for (const file of sourceFiles!) {
        let txt = (await read(file)).toString();
        sources.push(ts.createSourceFile(path.parse(file).base, txt, ts.ScriptTarget.ES2018));
    }
    const program = ts.createProgram(sourceFiles, {});
    console.log(sourceFiles);
    checker = program.getTypeChecker();
    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.fileName.includes('node_modules'))
            continue;
        
        store.dispatch({ type: ts.SyntaxKind.SourceFile, node: sourceFile });
        ts.forEachChild(sourceFile, visitor)

        // console.log(`Visiting ${sourceFile.fileName}`);
        // ts.forEachChild(sourceFile, node => {
            
        //     console.log(`Visiting ${ts.SyntaxKind[node.kind]} ${node.getSourceFile().fileName}`);
        //     //store.dispatch({ type: node.kind, node });
        //     if (ts.isTypeAliasDeclaration(node)) {
        //         const symbol = checker.getSymbolAtLocation(node.name);
        //         const type = checker.getDeclaredTypeOfSymbol(symbol!);
        //         console.log(checker.typeToString(type));
        //         //const properties = checker.getPropertiesOfType(type);
        //         // properties.forEach(declaration => {
        //         //   console.log(`\tReal Type ${declaration.name}`);
        //         //   // prints username, info
        //         // });
        //     }
        // });
    }

    // const result = ts.transform(sources, [c => { ctx = c; return visitor as ts.Transformer<ts.Node> }]);

    //store.dispatch({ type: ts.SyntaxKind.SourceFile });

})();


