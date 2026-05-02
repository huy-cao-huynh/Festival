import { describe, expect, it } from "bun:test";
import type {
	AuthenticatedUser,
	CreateInviteInput,
	CreateOrganizationInput,
} from "@festival/common";
import { createApp } from "../src/app.js";
import type { AuthVerifier } from "../src/auth/types.js";
import { InMemoryOrganizationRepository } from "../src/repo/in-memory-organization-repository.js";

class FakeAuthVerifier implements AuthVerifier {
	constructor(private readonly users: Record<string, AuthenticatedUser>) {}

	async verify(token: string): Promise<AuthenticatedUser> {
		const user = this.users[token];
		if (!user) {
			throw new Error(`Unknown token ${token}`);
		}

		return user;
	}
}

async function createTestApp() {
	return createApp({
		env: { port: 3000 },
		repository: new InMemoryOrganizationRepository(),
		authVerifier: new FakeAuthVerifier({
			admin: {
				uid: "uid-admin",
				email: "admin@example.com",
				displayName: "Admin User",
			},
			admin2: {
				uid: "uid-admin2",
				email: "admin2@example.com",
				displayName: "Admin User 2",
			},
			invitee: {
				uid: "uid-invitee",
				email: "invitee@example.com",
				displayName: "Invitee User",
			},
		}),
	});
}

function withAuth(token: string, init?: RequestInit): RequestInit {
	return {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			...(init?.headers ?? {}),
		},
	};
}

describe("organization routes", () => {
	it("creates an organization and records the creator as Admin", async () => {
		const { app } = await createTestApp();
		const payload: CreateOrganizationInput = { name: "festival-admins" };

		const response = await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify(payload),
				}),
			),
		);

		expect(response.status).toBe(201);
		const data = (await response.json()) as {
			membership: { role: string };
			organization: { slug: string };
		};
		expect(data.organization.slug).toBe("festival-admins");
		expect(data.membership.role).toBe("Admin");
	});

	it("rejects unauthorized organization access", async () => {
		const { app } = await createTestApp();
		const response = await app.fetch(
			new Request("http://test/api/organizations/festival-admins"),
		);

		expect(response.status).toBe(401);
	});

	it("creates and accepts an allowed-role invite", async () => {
		const { app } = await createTestApp();

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "festival-admins" }),
				}),
			),
		);

		const inviteResponse = await app.fetch(
			new Request(
				"http://test/api/invites",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({
						organizationSlug: "festival-admins",
						email: "invitee@example.com",
						role: "Music Reviewer",
					} satisfies CreateInviteInput),
				}),
			),
		);

		expect(inviteResponse.status).toBe(201);
		const inviteData = (await inviteResponse.json()) as {
			invite: { token: string; role: string };
		};
		expect(inviteData.invite.role).toBe("Music Reviewer");

		const acceptResponse = await app.fetch(
			new Request(
				`http://test/api/invites/${inviteData.invite.token}/accept`,
				withAuth("invitee", {
					method: "POST",
					body: JSON.stringify({ name: "Invited Reviewer" }),
				}),
			),
		);

		expect(acceptResponse.status).toBe(201);
		const acceptData = (await acceptResponse.json()) as {
			membership: { role: string; showWelcome: boolean };
		};
		expect(acceptData.membership.role).toBe("Music Reviewer");
		expect(acceptData.membership.showWelcome).toBeTrue();
	});

	it("rejects duplicate organization slug with 409", async () => {
		const { app } = await createTestApp();

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "festival-admins" }),
				}),
			),
		);

		const response = await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin2", {
					method: "POST",
					body: JSON.stringify({ name: "festival-admins" }),
				}),
			),
		);

		expect(response.status).toBe(409);
	});

	it("rejects org creation when the user already has a membership with 409", async () => {
		const { app } = await createTestApp();

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "festival-admins" }),
				}),
			),
		);

		const response = await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "second-org" }),
				}),
			),
		);

		expect(response.status).toBe(409);
	});

	it("rejects invite creation by a non-Admin member with 403", async () => {
		const { app } = await createTestApp();

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "festival-admins" }),
				}),
			),
		);

		const inviteRes = await app.fetch(
			new Request(
				"http://test/api/invites",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({
						organizationSlug: "festival-admins",
						email: "invitee@example.com",
						role: "Music Reviewer",
					} satisfies CreateInviteInput),
				}),
			),
		);
		const { invite } = (await inviteRes.json()) as {
			invite: { token: string };
		};

		await app.fetch(
			new Request(
				`http://test/api/invites/${invite.token}/accept`,
				withAuth("invitee", {
					method: "POST",
					body: JSON.stringify({ name: "Invited Reviewer" }),
				}),
			),
		);

		const response = await app.fetch(
			new Request(
				"http://test/api/invites",
				withAuth("invitee", {
					method: "POST",
					body: JSON.stringify({
						organizationSlug: "festival-admins",
						email: "someone@example.com",
						role: "Read Only",
					} satisfies CreateInviteInput),
				}),
			),
		);

		expect(response.status).toBe(403);
	});

	it("rejects invite acceptance when the invite email does not match the authenticated user with 403", async () => {
		const { app } = await createTestApp();

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "festival-admins" }),
				}),
			),
		);

		const inviteRes = await app.fetch(
			new Request(
				"http://test/api/invites",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({
						organizationSlug: "festival-admins",
						email: "invitee@example.com",
						role: "Music Reviewer",
					} satisfies CreateInviteInput),
				}),
			),
		);
		const { invite } = (await inviteRes.json()) as {
			invite: { token: string };
		};

		const response = await app.fetch(
			new Request(
				`http://test/api/invites/${invite.token}/accept`,
				withAuth("admin2", {
					method: "POST",
					body: JSON.stringify({ name: "Wrong User" }),
				}),
			),
		);

		expect(response.status).toBe(403);
	});

	it("rejects invite acceptance when the user already belongs to a different organization with 409", async () => {
		const { app } = await createTestApp();

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "org-one" }),
				}),
			),
		);

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin2", {
					method: "POST",
					body: JSON.stringify({ name: "org-two" }),
				}),
			),
		);

		const inviteRes = await app.fetch(
			new Request(
				"http://test/api/invites",
				withAuth("admin2", {
					method: "POST",
					body: JSON.stringify({
						organizationSlug: "org-two",
						email: "admin@example.com",
						role: "Read Only",
					} satisfies CreateInviteInput),
				}),
			),
		);
		const { invite } = (await inviteRes.json()) as {
			invite: { token: string };
		};

		const response = await app.fetch(
			new Request(
				`http://test/api/invites/${invite.token}/accept`,
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "Admin" }),
				}),
			),
		);

		expect(response.status).toBe(409);
	});

	it("returns an unauthenticated session when no token is provided", async () => {
		const { app } = await createTestApp();

		const response = await app.fetch(new Request("http://test/api/session"));

		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			session: { authenticated: boolean };
		};
		expect(data.session.authenticated).toBeFalse();
	});

	it("returns invite details for a valid token without authentication", async () => {
		const { app } = await createTestApp();

		await app.fetch(
			new Request(
				"http://test/api/organizations",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({ name: "festival-admins" }),
				}),
			),
		);

		const inviteRes = await app.fetch(
			new Request(
				"http://test/api/invites",
				withAuth("admin", {
					method: "POST",
					body: JSON.stringify({
						organizationSlug: "festival-admins",
						email: "invitee@example.com",
						role: "Division Chair",
					} satisfies CreateInviteInput),
				}),
			),
		);
		const { invite } = (await inviteRes.json()) as {
			invite: { token: string };
		};

		const response = await app.fetch(
			new Request(`http://test/api/invites/${invite.token}`),
		);

		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			invite: { organizationSlug: string; role: string; email: string };
		};
		expect(data.invite.organizationSlug).toBe("festival-admins");
		expect(data.invite.role).toBe("Division Chair");
		expect(data.invite.email).toBe("invitee@example.com");
	});
});
