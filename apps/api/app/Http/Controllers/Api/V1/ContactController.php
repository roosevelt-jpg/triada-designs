<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\User;
use App\Services\CRM\Zoho\ZohoCrmClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ContactController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $contacts = Contact::query()
            ->where('workspace_id', $workspaceId)
            ->when($request->string('q')->toString(), function ($query, $q) {
                $query->where(function ($inner) use ($q) {
                    $inner->where('name', 'like', "%{$q}%")
                        ->orWhere('email', 'like', "%{$q}%")
                        ->orWhere('phone', 'like', "%{$q}%");
                });
            })
            ->orderByDesc('updated_at')
            ->paginate(25);

        return response()->json($contacts);
    }

    public function show(Request $request, string $contactId): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $contact = Contact::query()
            ->where('workspace_id', $workspaceId)
            ->with(['identities', 'leads'])
            ->findOrFail($contactId);

        return response()->json($contact);
    }

    public function store(Request $request, ZohoCrmClient $zoho): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:180'],
            'email' => ['nullable', 'email', 'max:180'],
            'phone' => ['nullable', 'string', 'max:40'],
            'preferred_language' => ['nullable', 'string', 'max:16'],
            'source' => ['nullable', 'string', 'max:80'],
            'sync_to_zoho' => ['sometimes', 'boolean'],
        ]);

        $contact = Contact::query()->create([
            'workspace_id' => $workspaceId,
            'name' => $data['name'] ?? null,
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'email_normalized' => isset($data['email']) ? Str::lower(trim($data['email'])) : null,
            'phone_normalized' => isset($data['phone']) ? preg_replace('/\D+/', '', $data['phone']) : null,
            'preferred_language' => $data['preferred_language'] ?? 'en',
            'lifecycle_status' => 'lead',
            'source' => $data['source'] ?? 'manual',
        ]);

        if ($request->boolean('sync_to_zoho', true)) {
            $remote = $zoho->upsertContact([
                'name' => $contact->name,
                'email' => $contact->email,
                'phone' => $contact->phone,
            ]);
            $contact->forceFill(['external_crm_id' => $remote['id'] ?? null])->save();
        }

        return response()->json($contact->fresh(), 201);
    }

    protected function workspaceId(Request $request): string
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');

        abort_unless($workspaceId, 403, 'No workspace membership.');

        return (string) $workspaceId;
    }
}
