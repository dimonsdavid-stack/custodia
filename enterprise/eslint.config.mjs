import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const compat = new FlatCompat({baseDirectory:dirname(fileURLToPath(import.meta.url))});
const config = [...compat.extends('next/core-web-vitals','next/typescript'),{ignores:['.next/**','node_modules/**','security/**','outbound/**','infra/**','tests/**','next-env.d.ts']}];

export default config;
