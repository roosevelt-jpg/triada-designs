<?php

namespace App\Services\Creative;

class PlatformSizeCatalog
{
    /**
     * @return array<string, array{label:string,width:int,height:int,aspect:string}>
     */
    public function all(): array
    {
        return (array) config('creative.platform_sizes', []);
    }

    /**
     * @return array{label:string,width:int,height:int,aspect:string}|null
     */
    public function get(string $platformTarget): ?array
    {
        $all = $this->all();

        return $all[$platformTarget] ?? null;
    }

    /**
     * @param  list<string>|null  $targets
     * @return array<string, array{label:string,width:int,height:int,aspect:string}>
     */
    public function resolve(?array $targets = null): array
    {
        $all = $this->all();
        if ($targets === null || $targets === []) {
            return $all;
        }

        $out = [];
        foreach ($targets as $key) {
            if (isset($all[$key])) {
                $out[$key] = $all[$key];
            }
        }

        return $out;
    }
}
