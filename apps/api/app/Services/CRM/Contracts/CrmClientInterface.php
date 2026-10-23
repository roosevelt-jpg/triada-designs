<?php

namespace App\Services\CRM\Contracts;

interface CrmClientInterface
{
    public function provider(): string;

    /**
     * @return array{status:string,mode:string,configured:bool,message:string}
     */
    public function healthCheck(): array;

    /**
     * @param  array<string, mixed>  $contact
     * @return array<string, mixed>
     */
    public function upsertContact(array $contact): array;

    /**
     * @param  array<string, mixed>  $lead
     * @return array<string, mixed>
     */
    public function upsertLead(array $lead): array;

    /**
     * @return list<array<string, mixed>>
     */
    public function listRecentLeads(int $limit = 10): array;
}
