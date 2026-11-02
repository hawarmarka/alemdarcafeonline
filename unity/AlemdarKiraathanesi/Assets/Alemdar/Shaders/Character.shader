// Karakter: ten dokusu + köşe rengi maskesiyle kıyafet (r gömlek, g pantolon, b ayakkabı). Standart ışık modeli, gölge alır/verir.
Shader "Alemdar/Character"
{
    Properties
    {
        _MainTex ("Ten", 2D) = "white" {}
        _BumpMap ("Normal", 2D) = "bump" {}
        _Fabric ("Kumaş", 2D) = "white" {}
        _Shirt ("Gömlek", Color) = (0.3,0.4,0.6,1)
        _Pants ("Pantolon", Color) = (0.15,0.15,0.18,1)
        _Shoes ("Ayakkabı", Color) = (0.08,0.06,0.05,1)
        _SkinTint ("Ten tonu", Color) = (1,1,1,1)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma target 3.5
        sampler2D _MainTex, _BumpMap, _Fabric;
        fixed4 _Shirt, _Pants, _Shoes, _SkinTint;
        struct Input { float2 uv_MainTex; float4 color : COLOR; float3 worldPos; };
        void surf (Input IN, inout SurfaceOutputStandard o)
        {
            fixed3 skin = tex2D(_MainTex, IN.uv_MainTex).rgb * _SkinTint.rgb;
            float fab = tex2D(_Fabric, IN.uv_MainTex * 18).r;
            float3 m = IN.color.rgb;
            float cloth = saturate(m.r + m.g + m.b);
            fixed3 c = _Shirt.rgb * m.r + _Pants.rgb * m.g + _Shoes.rgb * m.b;
            o.Albedo = lerp(skin, c * fab, cloth);
            o.Normal = cloth > 0.5 ? float3(0,0,1) : UnpackNormal(tex2D(_BumpMap, IN.uv_MainTex));
            o.Smoothness = lerp(0.38, 0.08, saturate(m.r + m.g)) + m.b * 0.45;
            o.Metallic = 0;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
