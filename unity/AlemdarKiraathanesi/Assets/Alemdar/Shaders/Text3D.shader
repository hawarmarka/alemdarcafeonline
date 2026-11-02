// Dünyadaki yazılar (tabela, isim etiketi): derinliği dikkate alır, duvarın arkasından görünmez.
Shader "Alemdar/Text3D"
{
    Properties { _MainTex ("Font", 2D) = "white" {} _Color ("Renk", Color) = (1,1,1,1) }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off Lighting Off
        Pass
        {
            CGPROGRAM
            #pragma vertex v
            #pragma fragment f
            #pragma multi_compile_fog
            #include "UnityCG.cginc"
            sampler2D _MainTex; float4 _MainTex_ST; fixed4 _Color;
            struct a2v { float4 pos : POSITION; float2 uv : TEXCOORD0; fixed4 col : COLOR; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; fixed4 col : COLOR; UNITY_FOG_COORDS(1) };
            v2f v (a2v i) { v2f o; o.pos = UnityObjectToClipPos(i.pos); o.uv = TRANSFORM_TEX(i.uv, _MainTex); o.col = i.col * _Color; UNITY_TRANSFER_FOG(o, o.pos); return o; }
            fixed4 f (v2f i) : SV_Target { fixed4 c = i.col; c.a *= tex2D(_MainTex, i.uv).a; UNITY_APPLY_FOG(i.fogCoord, c); return c; }
            ENDCG
        }
    }
}
