<?php

namespace App\Services\Publishing\Contracts;

use App\Models\ContentItem;
use App\Models\Workspace;

interface PublishAdapterInterface
{
    public function key(): string;

    /**
     * @return array{ok:bool,mode:string,external_id?:string,external_url?:string,error?:string,raw?:array<string,mixed>}
     */
    public function publish(Workspace $workspace, ContentItem $item): array;
}
