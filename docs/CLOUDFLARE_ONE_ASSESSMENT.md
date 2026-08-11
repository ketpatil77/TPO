# Cloudflare One Migration Assessment

Source stack: none identified.

Artifacts reviewed: TPO portal repository, Worker configuration, Supabase deployment, public `workers.dev` endpoint.

Recommended target: Cloudflare Workers remains correct hosting/runtime. Cloudflare One migration is not applicable because project has no Zscaler ZIA/ZPA, Palo Alto/Prisma/GlobalProtect, legacy VPN, SWG, private network, connector, identity-provider, or policy export in scope.

Not migrated: all Cloudflare One resources. Creating Tunnel, WARP, Gateway, Access, DLP, or network policies without a source inventory would add complexity and could block valid portal traffic.

Future trigger: reassess only if college supplies a private-network/VPN/SWG source stack plus structured exports, identity groups, application destinations, policies, exceptions, and hit counts. Pilot migrated rules in audit/disabled mode before enforcement.
