<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Protects process-on-demand worker endpoints invoked by Vercel Cron Jobs
 * (or any scheduler) via Authorization: Bearer <CRON_SECRET>.
 */
class VerifyCronSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('integrations.cron_secret', '');

        if ($expected === '') {
            return response()->json([
                'ok' => false,
                'error' => 'CRON_SECRET is not configured on the API.',
            ], 503);
        }

        $header = (string) $request->header('Authorization', '');
        $provided = '';
        if (str_starts_with($header, 'Bearer ')) {
            $provided = trim(substr($header, 7));
        }
        if ($provided === '') {
            $provided = (string) $request->header('X-Cron-Secret', '');
        }

        if ($provided === '' || ! hash_equals($expected, $provided)) {
            return response()->json([
                'ok' => false,
                'error' => 'Unauthorized cron request.',
            ], 401);
        }

        return $next($request);
    }
}
