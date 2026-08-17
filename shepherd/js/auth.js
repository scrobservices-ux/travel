/* Who is signed in, what they may do, and which of the three workspaces they can open.
 *
 * What a role may do is not fixed in this file — it comes from the arrangement the
 * body of elders has set on the congregation (Administration → Roles &
 * responsibilities), falling back to the default one in schema.js. A capability
 * can be held for the whole congregation or narrowed to a person's own service
 * group, which is how a group overseer normally works. */
(function (global) {
  'use strict';

  var S = global.Schema, Store = global.Store, U = global.U;
  var Auth = {};

  Auth.me = function () { return Store.person(Store.state.session.personId); };

  Auth.roles = function (person) {
    var p = person || Auth.me();
    if (!p) return [];
    var roles = (p.roles || []).slice();
    if (roles.indexOf('publisher') === -1) roles.push('publisher');
    return roles;
  };

  Auth.isAdmin = function (person) {
    return Auth.roles(person).indexOf('admin') !== -1;
  };

  Auth.matrix = function (cong) {
    return S.matrixFor(cong || Store.cong());
  };

  /* The widest grant any of the person's roles gives: 'all' | 'group' | 'none'. */
  Auth.grant = function (capability, person) {
    var roles = Auth.roles(person);
    if (roles.indexOf('admin') !== -1) return 'all';
    if (capability === 'admin.manage') return 'none';
    var matrix = Auth.matrix();
    var best = 'none';
    for (var i = 0; i < roles.length; i++) {
      var g = S.grantFor(matrix, capability, roles[i]);
      if (g === 'all') return 'all';
      if (g === 'group') best = 'group';
    }
    return best;
  };

  Auth.can = function (capability, person) {
    return Auth.grant(capability, person) !== 'none';
  };

  /* 'all' or 'group' — what the person sees for a capability they hold. */
  Auth.scope = function (capability, person) {
    return Auth.grant(capability, person);
  };

  /* Does this capability reach that person's records? */
  Auth.reaches = function (capability, targetPersonId, person) {
    var g = Auth.grant(capability, person);
    if (g === 'all') return true;
    if (g === 'none') return false;
    var me = person || Auth.me();
    var target = Store.person(targetPersonId);
    return !!(me && target && target.serviceGroupId === me.serviceGroupId);
  };

  /* Everyone whose records this capability covers. */
  Auth.peopleInScope = function (capability, person) {
    var g = Auth.grant(capability, person);
    if (g === 'none') return [];
    var people = Store.people();
    if (g === 'all') return people;
    var me = person || Auth.me();
    if (!me) return [];
    return people.filter(function (p) { return p.serviceGroupId === me.serviceGroupId; });
  };

  /* A short phrase for the interface, e.g. "Group 2 — Acacia only". */
  Auth.scopeLabel = function (capability, person) {
    if (Auth.grant(capability, person) !== 'group') return null;
    var me = person || Auth.me();
    var g = me && Store.group(me.serviceGroupId);
    return g ? g.name + ' only' : 'your service group only';
  };

  Auth.workspaces = function (person) {
    var roles = Auth.roles(person);
    var out = {};
    S.ROLES.forEach(function (r) {
      if (roles.indexOf(r.id) === -1) return;
      r.workspaces.forEach(function (w) { out[w] = true; });
    });
    out.publisher = true;
    return S.WORKSPACES.filter(function (w) { return out[w.id]; });
  };

  Auth.canOpen = function (workspaceId, person) {
    return Auth.workspaces(person).some(function (w) { return w.id === workspaceId; });
  };

  Auth.workspace = function () {
    var ws = Store.state.session.workspace || 'publisher';
    if (!Auth.canOpen(ws)) ws = 'publisher';
    return ws;
  };

  Auth.setWorkspace = function (id) {
    if (!Auth.canOpen(id)) return false;
    Store.update(function (st) { st.session.workspace = id; });
    return true;
  };

  Auth.signInAs = function (personId) {
    var p = Store.person(personId);
    if (!p) return false;
    Store.update({ action: 'session.switch', summary: 'Signed in as ' + Store.name(personId) },
      function (st) {
        st.session.personId = personId;
        st.session.congId = p.congId;
        if (!Auth.canOpen(st.session.workspace, p)) {
          st.session.workspace = Auth.workspaces(p)[0].id;
        }
      });
    return true;
  };

  Auth.roleLabel = function (person) {
    var p = person || Auth.me();
    if (!p) return '';
    var named = (p.roles || []).filter(function (r) { return r !== 'publisher'; });
    if (!named.length) return 'Publisher';
    return named.map(S.roleName).join(' · ');
  };

  Auth.visiblePeople = function () {
    return Auth.peopleInScope('publishers.view');
  };

  global.Auth = Auth;
})(typeof window !== 'undefined' ? window : globalThis);
