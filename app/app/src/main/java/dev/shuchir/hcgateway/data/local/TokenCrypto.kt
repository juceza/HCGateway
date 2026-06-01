package dev.shuchir.hcgateway.data.local

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Encrypts small secrets (the auth + refresh tokens) at rest using an AES-256-GCM
 * key held in the Android Keystore. The key material never leaves the secure
 * hardware/keystore and is not included in device backups, so even a backup
 * extraction or root-level read of the DataStore file yields only ciphertext.
 *
 * Stored form: "enc1:" + Base64(iv ‖ ciphertext+tag).
 */
@Singleton
class TokenCrypto
@Inject
constructor() {
    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let {
            return it.secretKey
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec
                .Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    /** Returns the encrypted, prefixed form. Empty input stays empty. */
    fun encrypt(plain: String): String {
        if (plain.isEmpty()) return ""
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return PREFIX + Base64.encodeToString(iv + ciphertext, Base64.NO_WRAP)
    }

    /**
     * Reverses [encrypt]. Values without the prefix are returned unchanged
     * (defensive: handles any value not written by this class). A corrupt or
     * undecryptable value yields "" so the user is simply treated as logged out.
     */
    fun decrypt(stored: String): String {
        if (stored.isEmpty()) return ""
        if (!stored.startsWith(PREFIX)) return stored
        return try {
            val combined = Base64.decode(stored.removePrefix(PREFIX), Base64.NO_WRAP)
            val iv = combined.copyOfRange(0, IV_LENGTH)
            val ciphertext = combined.copyOfRange(IV_LENGTH, combined.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (_: Exception) {
            ""
        }
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "hcgateway_token_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val PREFIX = "enc1:"
        const val IV_LENGTH = 12
        const val TAG_BITS = 128
    }
}
