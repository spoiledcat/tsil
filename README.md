# tsil - typescript to il

/ti:.sl̩/

## What is it

It's a very early rough attempt at compiling typescript to .net IL. *Very early and rough*.

`compile.ts` has approach #1. It's using the transform api of typescript with a visitor pattern to go down every node. `redux-test.ts` is using a different approach to the visitor pattern (which I prefer), and using the type checker api.

The transform api doesn't have access to inferred types, the type checker api does. However, for some reason I haven't figured out yet, the type checker functions for going down the ast tree are skipping nodes and not traversing everything. The transform api works great but doesn't have inferred types. Needs more investigation...

## Building

- Install node
- Install yarn
- Run `yarn install`

## Running tsil

- Make sure you have `ilasm` available in your path
- Run `yarn try`, which will run `node_modules/.bin/ts-node compile.ts tests/app/hello.ts` for you. IL and exe files get created in `tests/app`, in this example.
