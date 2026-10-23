<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FoundationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_health_endpoint(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('service', 'triada-api');
    }

    public function test_demo_login_and_dashboard(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@triada-designs.com',
            'password' => 'triada-demo',
            'device_name' => 'test',
        ])->assertOk();

        $token = $login->json('token');
        $this->assertNotEmpty($token);

        $this->withToken($token)
            ->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonStructure(['metrics' => ['open_conversations', 'qualified_leads']]);
    }

    public function test_integrations_health_mock_mode(): void
    {
        $user = User::query()->where('email', 'admin@triada-designs.com')->firstOrFail();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/integrations/health')
            ->assertOk()
            ->assertJsonPath('wordpress.status', 'mock')
            ->assertJsonPath('zoho.status', 'mock');
    }

    public function test_human_takeover_changes_mode(): void
    {
        $user = User::query()->where('email', 'admin@triada-designs.com')->firstOrFail();
        $token = $user->createToken('test')->plainTextToken;

        $list = $this->withToken($token)->getJson('/api/v1/conversations')->assertOk();
        $id = $list->json('data.0.id');
        $this->assertNotEmpty($id);

        $this->withToken($token)
            ->postJson("/api/v1/conversations/{$id}/takeover")
            ->assertOk()
            ->assertJsonPath('automation_mode', 'human');
    }
}
