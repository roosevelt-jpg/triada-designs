<?php

namespace App\Services\AI\Contracts;

interface LlmAdapterInterface
{
    public function providerKey(): string;

    public function model(): string;

    public function isLive(): bool;

    /**
     * @param  array{system?:string,prompt:string,temperature?:float,max_tokens?:int}  $request
     * @return array{ok:bool,text?:string,provider:string,model:string,prompt_tokens:int,completion_tokens:int,raw?:array<string,mixed>,error?:string}
     */
    public function complete(array $request): array;
}
