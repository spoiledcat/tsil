import * as ts from 'typescript';
import { readFile, writeFile } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import path from 'path';

enum ExpressionType {
    Call,
    Ret,
}

interface IExpression {
    type: ExpressionType;
    name: string[];
    args: string[];
}

interface IMethod {
    name: string;
    isStatic: boolean;
    isPrivate: boolean;
    isEntry: boolean;
    returns: string;
    arguments: string[];
    body: IExpression[];
}

class Compiler {
    static compiler: Compiler;
    methods: IMethod[] = [];
    context: ts.TransformationContext | undefined;
    static currentMethod = () =>
        Compiler.compiler.methods.length > 0
            ? Compiler.compiler.methods[Compiler.compiler.methods.length - 1]
            : undefined;

    static factory<T extends ts.Node>(context: ts.TransformationContext): ts.Transformer<T> {
        Compiler.compiler = new Compiler();
        Compiler.compiler.context = context;
        return Compiler.visitor;
    }

    static visitor<T extends ts.Node>(node: ts.Node): T {
        console.log(`Visiting ${ts.SyntaxKind[node.kind]}`);
        let method = Compiler.currentMethod()!;
        switch (node.kind) {
            case ts.SyntaxKind.SourceFile:
                {
                    method = {
                        name: 'main',
                        isStatic: true,
                        isPrivate: true,
                        isEntry: true,
                        returns: 'void',
                        arguments: [],
                        body: [],
                    };
                    Compiler.compiler.methods.push(method);
                }
                break;
            case ts.SyntaxKind.CallExpression:
                {
                    let calle: IExpression = {
                        type: ExpressionType.Call,
                        name: [],
                        args: [],
                    };

                    let args = (<ts.CallExpression>node).arguments;
                    if (args) {
                        args.forEach(arg => {
                            calle.args.push((<ts.StringLiteral>arg).text);
                        });
                    }

                    method.body.push(calle);
                }
                break;
            case ts.SyntaxKind.Identifier: {
                let str: string = (<ts.Identifier>node).escapedText.toString();
                let expr = method.body.pop();
                if (!expr) {
                    break;
                }
                expr.name.push(str);
                method.body.push(expr);
                break;
            }
            case ts.SyntaxKind.FunctionDeclaration:
                {
                    const func: ts.FunctionDeclaration = <ts.FunctionDeclaration>node;
                    method = {
                        name: func.name,
                        isStatic: true,
                        isPrivate: true,
                        isEntry: true,
                        returns: 'void',
                        arguments: [],
                        body: [],
                    };
                    Compiler.compiler.methods.push(method);
                }
                break;
            case ts.SyntaxKind.StringKeyword:
                {
                }
                break;
            case ts.SyntaxKind.Block:
                {
                }
                break;
            case ts.SyntaxKind.ReturnStatement:
                {
                }
                break;
            case ts.SyntaxKind.StringLiteral:
                {
                }
                break;
            case ts.SyntaxKind.ExpressionStatement:
                {
                }
                break;
            case ts.SyntaxKind.PropertyAccessExpression:
                {
                }
                break;
            default:
                break;
        }

        ts.visitEachChild(node, Compiler.visitor, Compiler.compiler.context!);
        if (node.kind === ts.SyntaxKind.SourceFile) {
            Compiler.currentMethod()!.body.push({
                type: ExpressionType.Ret,
                name: [],
                args: [],
            });
        }
        return <T>node;
    }
}

const optionDefinitions = [
    {
        name: 'help',
        alias: 'h',
        description: 'Display this usage guide.',
    },
    {
        name: 'out',
        typeLabel: '{underline file}',
        description: 'Output assembly name',
    },
];

const sections = [
    {
        header: 'TSIL',
        content: 'Compile typescript into .net',
    },
    {
        header: 'Options',
        optionList: optionDefinitions,
    },
];

const options = commandLineArgs(optionDefinitions, { partial: true });
const sourceFiles = options._unknown;
if (!sourceFiles) {
    console.error(commandLineUsage(sections));
    process.exit(-1);
}

const targetAssembly: string = options.out || 'hello.exe';
const assemblyName = path.parse(targetAssembly).name;
const outputILFile = `${assemblyName}.il`;

(async () => {
    const printer: ts.Printer = ts.createPrinter();
    let read = promisify(readFile);
    //let txt = (await read('hello.tsi')).toString();
    //const source: ts.SourceFile = ts.createSourceFile('source.ts', txt, ts.ScriptTarget.ES2018);
    //console.log(printer.printFile(source));

    const sources: ts.SourceFile[] = [];
    for (const file of sourceFiles!) {
        let txt = (await read(file)).toString();
        sources.push(ts.createSourceFile(path.parse(file).base, txt, ts.ScriptTarget.ES2018));
    }

    const result = ts.transform(sources, [Compiler.factory]);

    result.transformed[0];

    let output: string = '';

    output += `
.assembly '${assemblyName}' {}
.module ${assemblyName}
`;
    for (let m of Compiler.compiler.methods) {
        console.log(m);

        output += `
    .method ${m.isStatic ? 'static' : ''} hidebysig default ${m.returns} ${m.name}(${m.arguments.join(
            ', '
        )}) cil managed {
`;

        if (m.isEntry) {
            output += `
      .entrypoint`;
        }
        output += `
    .maxstack 1`;

        for (let line of m.body) {
            switch (line.type) {
                case ExpressionType.Call:
                    {
                        let arg: string = line.args.join(', ');
                        output += `
            ldstr "${arg}"`;
                        let str: string = '';
                        for (let i = 0; i < line.name.length - 1; i++) {
                            str += line.name[i];
                            if (i < line.name.length - 2) str += '.';
                        }
                        str += `::${line.name[line.name.length - 1]}`;
                        if (line.name[0] === 'System') str = `[mscorlib]${str}`;
                        output += `
            call void class ${str}(string)`;
                    }
                    break;
                case ExpressionType.Ret:
                    {
                        output += `
            ret`;
                        output += `
            }`;
                    }
                    break;
            }
        }
    }

    output += `
  `;

    let write = promisify(writeFile);
    await write(outputILFile, output);
    exec(`ilasm ${outputILFile} /output:${targetAssembly}`);
    console.log(`${targetAssembly} ready`);
})();
