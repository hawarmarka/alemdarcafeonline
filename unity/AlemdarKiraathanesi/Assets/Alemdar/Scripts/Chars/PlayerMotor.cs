// Oyuncunun karakteri: WASD/oklar, Shift koşu, fareyle bakış, tekerlekle yakınlaştırma, tıklanan yere yürüme (NavMesh yolu).
// Oturma: sandalyenin önüne yürür, döner, oturur. Kamera duvara girmez (küre izdüşümü).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace Alemdar.Chars
{
    public class PlayerMotor : MonoBehaviour
    {
        public const float WalkSpeed = 1.45f, RunSpeed = 3.4f;
        public Person Body;
        public Camera Cam;
        public bool Seated { get; private set; }
        public bool InputLocked; // masada oyun oynarken yürüme kapalı
        public float Speed { get; private set; }
        public int PathLeft => path.Count;
        public event Action<Vector3> OnClickWorld;

        CharacterController cc;
        float yaw, pitch = 18, dist = 3.2f, vy;
        readonly List<Vector3> path = new();
        Action arrive;
        Vector3 seatPos; Quaternion seatRot;
        float sitBlend; bool sitting;
        public Vector3 CamFocusOverride; public bool UseFocusOverride;

        public void Init(Person body, Camera cam, Vector3 pos, float facing)
        {
            Body = body; Cam = cam;
            transform.position = pos; transform.rotation = Quaternion.Euler(0, facing, 0); yaw = facing;
            body.transform.SetParent(transform, false); body.transform.localPosition = Vector3.zero; body.transform.localRotation = Person.ModelFix; // modelin önü -z
            gameObject.layer = 2; // Ignore Raycast: kamera ve tıklama kendi gövdesine çarpmasın
            cc = gameObject.AddComponent<CharacterController>(); cc.radius = .26f; cc.height = 1.75f; cc.center = new Vector3(0, .88f, 0); cc.stepOffset = .25f; cc.minMoveDistance = 0;
        }

        public void WalkTo(Vector3 target, Action onArrive = null)
        {
            if (Seated) StandUp();
            path.Clear(); arrive = onArrive;
            var np = new NavMeshPath();
            if (NavMesh.SamplePosition(target, out var hit, 1.2f, NavMesh.AllAreas) && NavMesh.CalculatePath(transform.position, hit.position, NavMesh.AllAreas, np) && np.corners.Length > 0)
                path.AddRange(np.corners);
            else path.Add(target);
            if (path.Count > 0 && (path[0] - transform.position).sqrMagnitude < .01f) path.RemoveAt(0);
        }

        public void SitAt(Vector3 seat, Quaternion rot)
        {
            path.Clear(); arrive = null;
            seatPos = seat; seatRot = rot; Seated = true; sitting = true; cc.enabled = false; Body.SetSit(true);
        }
        public void StandUp()
        {
            if (!Seated) return;
            Seated = false; sitting = false; Body.SetSit(false);
            transform.position = seatPos + seatRot * Vector3.forward * .55f;
            cc.enabled = true;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            // bakış: sağ tık ya da sol tık sürükleme
            if (Input.GetMouseButton(1) || (Input.GetMouseButton(0) && !UI.Ui.PointerOverUi && dragging))
            { yaw += Input.GetAxis("Mouse X") * 3.2f; pitch = Mathf.Clamp(pitch - Input.GetAxis("Mouse Y") * 2.4f, -5, 70); }
            TrackClick();
            dist = Mathf.Clamp(dist - Input.mouseScrollDelta.y * .3f, 1.4f, 6f);

            Vector3 move = Vector3.zero;
            if (!InputLocked && !Seated)
            {
                float ix = (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow) ? 1 : 0) - (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow) ? 1 : 0);
                float iz = (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow) ? 1 : 0) - (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow) ? 1 : 0);
                if (ix != 0 || iz != 0) { path.Clear(); arrive = null; move = Quaternion.Euler(0, yaw, 0) * new Vector3(ix, 0, iz).normalized; }
            }
            else if (Seated && !InputLocked && (Input.GetKeyDown(KeyCode.W) || Input.GetKeyDown(KeyCode.S))) StandUp();
            if (move == Vector3.zero && path.Count > 0 && !Seated)
            {
                var to = path[0] - transform.position; to.y = 0;
                if (to.magnitude < .12f) { path.RemoveAt(0); if (path.Count == 0) { var a = arrive; arrive = null; a?.Invoke(); } }
                else move = to.normalized;
            }
            bool run = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift) || path.Count > 2;
            float want = move == Vector3.zero ? 0 : (run ? RunSpeed : WalkSpeed);
            Speed = Mathf.MoveTowards(Speed, want, dt * (want > Speed ? 7f : 10f));
            if (!Seated)
            {
                if (move != Vector3.zero) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(move), dt * 11f);
                vy = cc.isGrounded ? -1f : vy - 9.8f * dt;
                var vel = (move == Vector3.zero ? transform.forward : move) * Speed + Vector3.up * vy; // durunca kısa süre süzülür
                cc.Move(vel * dt);
            }
            else
            {
                // sandalyeye yumuşak geçiş
                sitBlend = Mathf.MoveTowards(sitBlend, 1, dt * 2.5f);
                transform.position = Vector3.Lerp(transform.position, seatPos, dt * 6f);
                transform.rotation = Quaternion.Slerp(transform.rotation, seatRot, dt * 6f);
            }
            Body.SetSpeed(Speed);
        }

        bool dragging; Vector3 downPos;
        void TrackClick()
        {
            if (Input.GetMouseButtonDown(0) && !UI.Ui.PointerOverUi) { downPos = Input.mousePosition; dragging = false; }
            if (Input.GetMouseButton(0) && (Input.mousePosition - downPos).sqrMagnitude > 64) dragging = true;
            if (Input.GetMouseButtonUp(0) && !dragging && !UI.Ui.PointerOverUi && !InputLocked)
            {
                var ray = Cam.ScreenPointToRay(Input.mousePosition);
                if (Physics.Raycast(ray, out var hit, 40f, ~(1 << 2))) OnClickWorld?.Invoke(hit.point);
            }
            if (Input.GetMouseButtonUp(0)) dragging = false;
        }

        void LateUpdate()
        {
            if (!Cam || InputLocked) return;
            var focus = UseFocusOverride ? CamFocusOverride : transform.position + Vector3.up * (Seated ? 1.25f : 1.6f);
            var rot = Quaternion.Euler(pitch, yaw, 0);
            var want = focus - rot * Vector3.forward * dist;
            if (Physics.SphereCast(focus, .18f, (want - focus).normalized, out var hit, dist, ~(1 << 2), QueryTriggerInteraction.Ignore)) want = focus + (want - focus).normalized * Mathf.Max(.4f, hit.distance - .05f);
            Cam.transform.position = Vector3.Lerp(Cam.transform.position, want, Time.deltaTime * 12f);
            Cam.transform.rotation = Quaternion.LookRotation(focus - Cam.transform.position);
        }
    }
}
