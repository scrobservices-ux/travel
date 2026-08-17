/* Who is signed in, what they may see, and which of the three workspaces they can open.
   In this build sign-in is a person picker (no server); the permission model itself is
   the real thing and every view asks it before rendering an action. */
(function (global) {
  'use strict';

  var S = global.Schema, Store = global.Store, U = global.U;
  var Auth = {};

  Auth.me = function () { return Store.me(); };

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

  Auth.can = function (capability, person) {
    var roles = Auth.roles(person);
    if (roles.indexOf('admin') !== -1) return true;
    var allowed = S.PERMISSIONS[capability];
    if (!allowed) return false;
    return allowed.some(function (r) { return roles.indexOf(r) !== -1; });
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

  /* People visible to the signed-in user. Publishers see the directory only if their
     congregation allows it; elders and above see everyone in the congregation. */
  Auth.visiblePeople = function () {
    if (Auth.can('publishers.view')) return Store.people();
    var me = Auth.me();
    if (!me) return [];
    return Store.people().filter(function (p) { return p.serviceGroupId === me.serviceGroupId; });
  };

  /* Shepherding notes are confidential to the body of elders. */
  Auth.canSeeVisit = function (visit) {
    if (Auth.can('shepherding.view')) return true;
    return false;
  };

  global.Auth = Auth;
})(typeof window !== 'undefined' ? window : globalThis);
