/* Shared three.js models. The airliner is an original medium-poly twin-engine design built from
   primitives, used on the globe and in the takeoff and landing scenes. Forward is +Z, up is +Y,
   length about 10 units, origin at the centre of the fuselage. */
(function () {
  var SF = (window.SF = window.SF || {});

  // Closed panel lofted between two airfoil-like sections (wing, stabiliser, fin). Each section has a
  // leading-edge point, a chord running back along -Z and a thickness along Y (wings) or X (fins).
  function loft(T, a, b, axis) {
    function sec(s) {
      var t = s.t / 2, o = axis === "x" ? [t, 0, 0] : [0, t, 0], L = s.le, c = s.c;
      return [[L[0], L[1], L[2]], [L[0] + o[0], L[1] + o[1], L[2] - .3 * c], [L[0], L[1], L[2] - c], [L[0] - o[0], L[1] - o[1], L[2] - .3 * c]];
    }
    var A = sec(a), B = sec(b), pos = [];
    function tri(p, q, r) { pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); }
    for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; tri(A[i], B[i], B[j]); tri(A[i], B[j], A[j]); }
    tri(A[0], A[1], A[2]); tri(A[0], A[2], A[3]); tri(B[0], B[2], B[1]); tri(B[0], B[3], B[2]);
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  function mirror(le, side) { return [le[0] * side, le[1], le[2]]; }

  SF.models = {
    airliner: function (T, opts) {
      opts = opts || {};
      var seg = opts.lowPoly ? 12 : 28;
      var body = new T.MeshStandardMaterial({ color: 0xf2efe8, metalness: .25, roughness: .42 });
      var grey = new T.MeshStandardMaterial({ color: 0xc9cbcf, metalness: .35, roughness: .5 });
      var dark = new T.MeshStandardMaterial({ color: 0x2a2d33, metalness: .4, roughness: .55 });
      var signal = new T.MeshStandardMaterial({ color: 0xffc400, metalness: .2, roughness: .45 });
      var glass = new T.MeshStandardMaterial({ color: 0x11161e, metalness: .6, roughness: .2 });
      var plane = new T.Group();
      plane.name = "airliner";

      // fuselage: a lathe profile from tail cone (y = 0) to nose (y = 10)
      var prof = [[0, 0], [.18, .1], [.55, .3], [1.4, .52], [2.4, .62], [8.4, .62], [9.1, .56], [9.6, .42], [9.9, .22], [10.02, 0]]
        .map(function (p) { return new T.Vector2(p[1], p[0]); });
      var fus = new T.Mesh(new T.LatheGeometry(prof, seg), body);
      fus.geometry.rotateX(Math.PI / 2);   // length along +Z
      fus.geometry.translate(0, 0, -5);
      fus.scale.set(1, 1.04, 1);
      plane.add(fus);
      // tail upsweep fairing and cockpit windscreen
      var cone = new T.Mesh(new T.ConeGeometry(.42, 2.2, seg), body);
      cone.rotation.x = -Math.PI / 2 - .12; cone.position.set(0, .16, -4.6);
      plane.add(cone);
      var screen = new T.Mesh(new T.SphereGeometry(.42, seg, 8, 0, Math.PI * 2, 0, Math.PI / 3), glass);
      screen.rotation.x = Math.PI / 2 - .5; screen.position.set(0, .2, 4.35);
      plane.add(screen);
      // window line
      var band = new T.Mesh(new T.CylinderGeometry(.625, .625, 5.6, seg, 1, true, -Math.PI / 2 - .5, 1), glass);
      band.rotation.x = Math.PI / 2; band.position.set(0, .12, .4); band.scale.set(1, 1, .06);
      plane.add(band);

      // flat-shaded, double-sided copies for the lofted panels
      function panelMat(m) { var c = m.clone(); c.side = T.DoubleSide; c.flatShading = true; return c; }
      var greyP = panelMat(grey), bodyP = panelMat(body), signalP = panelMat(signal);
      function add(geo, mat) { var m = new T.Mesh(geo, mat); plane.add(m); return m; }

      [-1, 1].forEach(function (side) {
        // main wing: swept back, slight dihedral, mounted low
        add(loft(T, { le: mirror([.45, -.34, 1.6], side), c: 2.8, t: .26 }, { le: mirror([6.6, -.06, -1.1], side), c: .8, t: .08 }), greyP);
        // winglet in the signal colour
        add(loft(T, { le: mirror([6.6, -.06, -1.1], side), c: .8, t: .07 }, { le: mirror([6.78, .78, -1.62], side), c: .38, t: .04 }, "x"), signalP);
        // engine: nacelle, intake ring, fan face, pylon
        var nac = new T.Mesh(new T.CylinderGeometry(.36, .29, 2.0, seg), body);
        nac.rotation.x = Math.PI / 2; nac.position.set(side * 2.4, -.86, 1.45);
        plane.add(nac);
        var ring = new T.Mesh(new T.TorusGeometry(.33, .06, 8, seg), dark);
        ring.position.set(side * 2.4, -.86, 2.45);
        plane.add(ring);
        var fan = new T.Mesh(new T.CircleGeometry(.31, seg), dark);
        fan.position.set(side * 2.4, -.86, 2.4);
        plane.add(fan);
        var pylon = new T.Mesh(new T.BoxGeometry(.1, .42, 1.3), grey);
        pylon.position.set(side * 2.4, -.5, 1.05);
        plane.add(pylon);
        // horizontal stabiliser
        add(loft(T, { le: mirror([.2, .12, -3.25], side), c: 1.5, t: .12 }, { le: mirror([2.55, .32, -4.4], side), c: .55, t: .05 }), greyP);
      });

      // vertical fin with the SkyFocus signal band across the top
      add(loft(T, { le: [0, .5, -2.9], c: 2.2, t: .16 }, { le: [0, 2.9, -4.5], c: .9, t: .07 }, "x"), bodyP);
      add(loft(T, { le: [0, 2.2, -4.03], c: 1.3, t: .1 }, { le: [0, 2.92, -4.51], c: .92, t: .085 }, "x"), signalP);

      plane.traverse(function (o) { if (o.isMesh) { o.castShadow = !!opts.shadows; o.receiveShadow = !!opts.shadows; } });
      return plane;
    }
  };
})();
