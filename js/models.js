/* Shared three.js models. The airliner is an original medium-poly twin-engine design built from
   primitives, used on the globe and in the takeoff and landing scenes. Forward is +Z, up is +Y,
   length about 10 units, origin at the centre of the fuselage. */
(function () {
  var SF = (window.SF = window.SF || {});

  function swept(T, span, root, tip, sweep, thick) {
    // planform in the XY plane (x = span, y = chord), extruded for thickness
    var s = new T.Shape();
    s.moveTo(0, 0); s.lineTo(span, -sweep); s.lineTo(span, -sweep - tip); s.lineTo(0, -root); s.closePath();
    var g = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * .4, bevelSize: thick * .4, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -thick / 2);
    return g;
  }

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

      // main wings: swept, slight dihedral, mounted low
      [-1, 1].forEach(function (side) {
        var w = new T.Mesh(swept(T, 6.2, 2.7, .8, 2.3, .14), grey);
        w.rotation.x = -Math.PI / 2;
        w.scale.x = side;
        w.rotation.z = side * .07;
        w.position.set(side * .35, -.28, 1.1);
        plane.add(w);
        // winglet
        var wl = new T.Mesh(swept(T, .7, .8, .35, .5, .06), signal);
        wl.rotation.set(0, side < 0 ? Math.PI : 0, side * 1.35);
        wl.position.set(side * 6.5, .15, -1.25);
        plane.add(wl);
        // engine nacelle, pylon and intake ring
        var nac = new T.Mesh(new T.CylinderGeometry(.34, .28, 1.9, seg), body);
        nac.rotation.x = Math.PI / 2; nac.position.set(side * 2.35, -.72, 1.2);
        plane.add(nac);
        var ring = new T.Mesh(new T.TorusGeometry(.32, .06, 8, seg), dark);
        ring.position.set(side * 2.35, -.72, 2.15);
        plane.add(ring);
        var fan = new T.Mesh(new T.CircleGeometry(.3, seg), dark);
        fan.position.set(side * 2.35, -.72, 2.1);
        plane.add(fan);
        var pylon = new T.Mesh(new T.BoxGeometry(.1, .4, 1.1), grey);
        pylon.position.set(side * 2.35, -.45, .9);
        plane.add(pylon);
        // horizontal stabiliser
        var hs = new T.Mesh(swept(T, 2.3, 1.5, .55, 1.1, .08), grey);
        hs.rotation.x = -Math.PI / 2; hs.scale.x = side; hs.rotation.z = side * .12;
        hs.position.set(side * .15, .25, -3.6);
        plane.add(hs);
      });

      // vertical fin with the SkyFocus signal stripe
      var fin = new T.Mesh(swept(T, 2.4, 2.1, .85, 1.6, .1), body);
      fin.rotation.set(0, -Math.PI / 2, Math.PI / 2);
      fin.rotation.order = "YZX";
      fin.position.set(0, .45, -3.2);
      plane.add(fin);
      var stripe = new T.Mesh(swept(T, .35, 1.6, 1.45, .25, .12), signal);
      stripe.rotation.copy(fin.rotation);
      stripe.position.set(0, 1.9, -4.25);
      plane.add(stripe);

      plane.traverse(function (o) { if (o.isMesh) { o.castShadow = !!opts.shadows; o.receiveShadow = !!opts.shadows; } });
      return plane;
    }
  };
})();
