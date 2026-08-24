import * as THREE from "three";

const Contact = window.__STORE_MOVEMENT_CONTACT__ ||= {};

function EnsureVector(Key) {
  if (!Contact[Key]?.isVector3) Contact[Key] = new THREE.Vector3();
}

for (const Key of [
  "Normal",
  "Position",
  "DesiredDirection",
  "SlideDirection",
  "CharacterFacing"
]) EnsureVector(Key);

if (!Number.isFinite(Contact.Strength)) Contact.Strength = 0;
if (!Number.isFinite(Contact.SlideAmount)) Contact.SlideAmount = 0;
if (!Number.isFinite(Contact.FacingAngle)) Contact.FacingAngle = 0;
if (!Number.isFinite(Contact.LastHit)) Contact.LastHit = -Infinity;
if (typeof Contact.Sliding !== "boolean") Contact.Sliding = false;
if (typeof Contact.Type !== "string") Contact.Type = "";

window.__STORE_MOVEMENT_CONTACT__ = Contact;
window.__STORE_MOVEMENT_CONTACT_COMPAT_BUILD__ = "V0.12.26";
