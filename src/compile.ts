import * as ts from "typescript";
import { readFile, writeFile } from "fs";
import { promisify } from "util";
import { exec } from "child_process";

enum ExpressionType {
  Call,
  Ret
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

  static factory<T extends ts.Node>(
    context: ts.TransformationContext
  ): ts.Transformer<T> {
    Compiler.compiler = new Compiler();
    Compiler.compiler.context = context;
    return Compiler.visitor;
  }

  static visitor<T extends ts.Node>(node: ts.Node): T {
    //console.log(`Visiting ${ts.SyntaxKind[node.kind]}`);
    let method = Compiler.currentMethod()!;
    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
        {
          method = {
            name: "main",
            isStatic: true,
            isPrivate: true,
            isEntry: true,
            returns: "void",
            arguments: [],
            body: []
          };
          Compiler.compiler.methods.push(method);
        }
        break;
      case ts.SyntaxKind.CallExpression:
        {
          let calle: IExpression = {
            type: ExpressionType.Call,
            name: [],
            args: []
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
        let expr = method.body.pop()!;
        expr.name.push(str);
        method.body.push(expr);
        break;
      }
      default:
        break;
    }

    ts.visitEachChild(node, Compiler.visitor, Compiler.compiler.context!);
    if (node.kind === ts.SyntaxKind.SourceFile) {
      Compiler.currentMethod()!.body.push({
        type: ExpressionType.Ret,
        name: [],
        args: []
      });
    }
    return <T>node;
  }
}

(async () => {
  const printer: ts.Printer = ts.createPrinter();
  let read = promisify(readFile);
  let txt = (await read("hello.tsi")).toString();
  const source: ts.SourceFile = ts.createSourceFile(
    "source.ts",
    txt,
    ts.ScriptTarget.ES2018
  );
  //console.log(printer.printFile(source));
  const result = ts.transform(source, [Compiler.factory]);

  result.transformed[0];

  let output: string = "";

  output += `
.assembly 'test' {}
.module test
`;
  for (let m of Compiler.compiler.methods) {
    output += `
    .method ${m.isStatic ? "static" : ""} hidebysig default ${m.returns} ${
      m.name
    }(${m.arguments.join(", ")}) cil managed {
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
            let arg: string = line.args.join(", ");
            output += `
            ldstr "${arg}"`;
            let str: string = "";
            for (let i = 0; i < line.name.length - 1; i++) {
              str += line.name[i];
              if (i < line.name.length - 2) str += ".";
            }
            str += `::${line.name[line.name.length - 1]}`;
            if (line.name[0] === "System") str = `[mscorlib]${str}`;
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
  await write("hello.il", output);
  exec("ilasm hello.il");
  console.log("hello.exe ready");
})();
