
.assembly 'test' {}
.module test

    .method static hidebysig default void main() cil managed {

      .entrypoint
    .maxstack 1
            ldstr "Im in ur dotnetz, typescripting ur stuffz"
            call void class [mscorlib]System.Console::WriteLine(string)
            ret
            }
  