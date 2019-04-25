import ts from 'typescript';
import { mkdir, readFile, writeFile, exists } from 'async-file';
import { exec } from 'child_process';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import path from 'path';
import { isUndefined } from 'util';

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
                        name: func.name!.toString(),
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

class Runner {

    private optionDefinitions = [
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

    private sections = [
        {
            header: 'TSIL',
            content: 'Compile typescript into .net',
        },
        {
            header: 'Options',
            optionList: this.optionDefinitions,
        },
    ];

    public targetAssembly: string = '';
    private targetDirectory: string = '';
    private assemblyName: string = '';

    private sourceFiles: string[] = [];

    public ParseCLI(args: string[]) : Promise<Runner> {
        const options = commandLineArgs(this.optionDefinitions, { argv: args, partial: true });
        const sourceFiles = options._unknown;
        console.log(sourceFiles)

        if (sourceFiles === undefined || sourceFiles.length === 0) {
            return Promise.reject(commandLineUsage(this.sections));
        }
        this.sourceFiles = sourceFiles;

        if (!options.out) {
            this.targetDirectory = path.parse(sourceFiles[0]).dir;
            this.targetAssembly = path.join(this.targetDirectory, path.parse(sourceFiles[0]).name + ".exe");
        }
        else
        {
            this.targetAssembly = path.parse(options.out).base;
            this.targetDirectory = path.parse(options.out).dir;
        }
        this.assemblyName = path.parse(this.targetAssembly).name;

        return Promise.resolve(this);
    }

    private sources: ts.SourceFile[] = [];
    private tsResult: ts.TransformationResult<ts.Node> | undefined;
    public ParseSourceFiles() : Promise<Runner> {
        const promises : Promise<ts.SourceFile>[] = [];
        for (const file of this.sourceFiles) {
            promises.push(readFile(file).then(
                contents => ts.createSourceFile(path.parse(file).base, contents.toString(), ts.ScriptTarget.ES2018)));
        }

        return Promise
            .all(promises)
            .then(sources => {
                this.sources = sources;
                this.tsResult = ts.transform(sources, [Compiler.factory]);
                return this;
            });
    }

    public async Compile() : Promise<Runner> {
        const promises : Promise<{file: string, il: string}>[] = [];
        for (const node of this.tsResult!.transformed) {
            promises.push(this.GenerateILFromNode(node));
        }

        let results = await Promise.all(promises);
        await mkdir(this.targetDirectory).catch(r => null);

        for (let output of results) {
            await writeFile(path.join(this.targetDirectory, path.parse(output.file).name + ".il"), output.il);
        }

        const ilfiles = results.map(f => path.join(this.targetDirectory, path.parse(f.file).name + ".il"));

        console.log(`Running ilasm ${ilfiles.join(' ')} /output:${this.targetAssembly}`);
        exec(`ilasm ${ilfiles.join(' ')} /output:${this.targetAssembly}`);
        console.log(`${this.targetAssembly} ready`);

        return this;
    }

    private GenerateILFromNode(node: ts.Node) : Promise<{file: string, il: string}> {

        let output: string = '';
    
        output += `
    .assembly '${this.assemblyName}' {}
    .module ${this.assemblyName}
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

        return Promise.resolve({ file: node.getSourceFile().fileName, il: output });
    }
}

(async () => {
    await new Runner().ParseCLI(process.argv)
        .then(r => r.ParseSourceFiles())
        .then(r => r.Compile())
        .catch(reason => console.error(reason));
        ;

    //const printer: ts.Printer = ts.createPrinter();
    //let txt = (await read('hello.tsi')).toString();
    //const source: ts.SourceFile = ts.createSourceFile('source.ts', txt, ts.ScriptTarget.ES2018);
    //console.log(printer.printFile(source));

    
    

})();
